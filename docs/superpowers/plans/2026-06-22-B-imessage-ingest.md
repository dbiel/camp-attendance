# B — iMessage Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** A launchd-managed Mac Mini watcher reads new incoming texts from `chat.db` and writes them to a super-admin-only Firestore `texts` collection, surfaced in an inbox with camp/personal auto-tagging and camp-end+30d purge.

**Architecture:** Read-only poll of `~/Library/Messages/chat.db` every 15s by ROWID cursor; decode `attributedBody` when `text` is null; resolve sender→contact; deterministic camp/personal classifier; idempotent writes by `message.guid`. Web app reads via `GET /api/texts` (super_admin); inbox is a polling client page.

**Tech Stack:** Node (script), better-sqlite3 (read-only), Firebase Admin SDK, Next.js API + page, Vitest.

## Global Constraints
- Node 24. Watcher opens chat.db **read-only/immutable**, never writes to it.
- `texts` collection is server-side-only in Firestore rules; all UI reads via API (super_admin).
- Capture ALL incoming services (iMessage/SMS/RCS/…), is_from_me=0 only. Read whatever `chat.db` reports for `service`.
- First run seeds cursor to MAX(ROWID) — no backfill of history.
- Idempotent by `message.guid` (Firestore doc id).
- Reuse Firebase Admin creds from repo `.env.local`; no new key.

---

### Task 1: `attributedBody` text decoder
**Files:** Create `scripts/imessage-watcher/lib/decode-attributed-body.js`. Test: `scripts/imessage-watcher/lib/decode-attributed-body.test.js` (run with vitest). Sample blobs: pull 3-5 real blobs from chat.db where text IS NULL, save as hex fixtures.
**Interfaces:** Produces `decodeAttributedBody(buffer: Buffer) → string` (returns '' on failure).
- [ ] Capture fixtures: `sqlite3 chat.db "SELECT hex(attributedBody) FROM message WHERE text IS NULL AND attributedBody IS NOT NULL AND is_from_me=0 ORDER BY ROWID DESC LIMIT 5"` → save to fixtures with the known plaintext (cross-check by reading those messages in Messages app or via the streamtyped string).
- [ ] Test: each fixture decodes to its expected substring; a garbage buffer returns ''.
- [ ] Implement: parse the NSKeyedArchiver/streamtyped blob — locate `NSString`/`+` marker, read the length-prefixed UTF-8 payload (handle both 1-byte and `0x81` 2-byte length encodings). Heuristic but covered by fixtures.
- [ ] Run; commit.

### Task 2: camp/personal classifier
**Files:** Create `lib/text-classify.ts` (shared so the API can re-tag too). Test: `tests/unit/lib/text-classify.test.ts`.
**Interfaces:** Produces `classifyText({body, senderContactRole, rosterNames, dormNames}) → {tag:'camp'|'personal'|'unknown', reason:string}`.
- [ ] Test: sender role faculty/dorm_staff/admin → camp (reason 'known camp contact'). Body containing a roster name or keyword (sick/hurt/missing/late/parent/camp/nurse/room/instrument) → camp (reason names the hit). No signal → personal. Empty body + unknown sender → unknown.
- [ ] Implement deterministic scoring; export keyword + instrument lists.
- [ ] Run; commit.

### Task 3: `texts` Firestore lib
**Files:** Create `lib/texts.ts`. Test: `tests/unit/lib/texts.test.ts` (mock adminDb).
**Interfaces:** Produces `upsertText(doc)` (set by guid, merge:false-but-id-stable so replays don't dup), `listTexts({tag?})`, `retagText(id, tag, reason)`, `dismissText(id)`, `setTextEscalated(id, caseId)`, `purgeExpiredTexts(now)`, `computePurgeAfter(campEndDate, sentAt)`. Type `TextDoc` per spec data model (service:string).
- [ ] Test: upsert by guid is idempotent (same guid twice → one doc). listTexts filters by tag. computePurgeAfter = campEnd+30d, or sentAt+90d fallback when no campEnd. purgeExpiredTexts deletes docs with purge_after<now, but NOT ones with escalated_case_id whose case is unresolved (skip-if-escalated rule).
- [ ] Implement; run; commit.

### Task 4: Firestore rules — deny `texts` + `ingest_state`
**Files:** Modify `firestore.rules`. Test: `tests/security/rules.test.ts` (emulator) — add cases.
- [ ] Add `match /texts/{id} { allow read, write: if false; }` and `match /ingest_state/{id} { allow read, write: if false; }` above the catch-all.
- [ ] Test (security suite): client read/write denied for both. (If emulator unavailable in this env, add the rule + note manual verify; rules also covered by deploy validation.)
- [ ] Commit.

### Task 5: `GET /api/texts` + re-tag/dismiss routes (super_admin)
**Files:** Create `app/api/texts/route.ts` (GET list, `?tag=`), `app/api/texts/[id]/route.ts` (PATCH retag, DELETE dismiss). Test: `tests/unit/api/texts.test.ts`.
**Interfaces:** Consumes `lib/texts.ts`. All routes `withAuth('super_admin')`.
- [ ] Test: super_admin GET returns list, tag filter works; lookup_admin/teacher → 403; PATCH retag updates; DELETE dismisses.
- [ ] Implement; run; commit.

### Task 6: Inbox UI page
**Files:** Create `app/admin/inbox/page.tsx` + a row component. Add nav link (super_admin-only) in the admin layout/nav. Test: manual + any unit on a pure helper.
**Interfaces:** Consumes `/api/texts`. Default `?tag=camp`; toggle camp/personal/all; poll every 10s. Each row: sender, service badge, body, time, tag chip; actions Escalate (wired in Plan C), Re-tag, Dismiss. Escalated rows show "View Report".
- [ ] Implement; build; commit.

### Task 7: The watcher (chat.db → Firestore) + cursor + purge pass
**Files:** Create `scripts/imessage-watcher/index.js`, `scripts/imessage-watcher/package.json` (better-sqlite3 dep, isolated from app deps), `scripts/imessage-watcher/.env.example`. Test: a dry-run mode (`--once --dry-run`) printing what it WOULD write.
**Interfaces:** Consumes decoder (T1), classifier (T2 — import compiled or re-implement minimal in JS; prefer reading `lib/text-classify` via ts-node or duplicate keyword list with a shared JSON). **Decision:** put keyword/instrument lists in `lib/text-classify-data.json`, imported by both TS lib and the JS watcher to stay DRY.
- [ ] Open chat.db read-only/immutable via better-sqlite3. Load cursor (cursor.json → fallback Firestore ingest_state/cursor → fallback MAX(ROWID) on first run).
- [ ] Query incoming rows ROWID>cursor (join handle for sender; select text, attributedBody, service, guid, date, cache_has_attachments). Decode body, resolve contact (findContactByPhone), classify, computePurgeAfter (read camp config end_date), upsertText. Advance cursor only after successful batch write.
- [ ] Daily purge pass: once per day call purgeExpiredTexts.
- [ ] Dry-run test: `node index.js --once --dry-run` prints N new messages with tags, writes nothing.
- [ ] Commit.

### Task 8: launchd service + install + README
**Files:** Create `scripts/imessage-watcher/com.ttuboc.imessage-watcher.plist`, `scripts/imessage-watcher/install.sh`, `scripts/imessage-watcher/README.md`.
- [ ] plist: ProgramArguments=node index.js, RunAtLoad, KeepAlive, StandardOut/Error logs to scripts/imessage-watcher/logs/. install.sh copies plist to ~/Library/LaunchAgents, `launchctl bootstrap`. README documents Full Disk Access requirement, Text Message Forwarding, how to start/stop/tail logs, and the manual "send a test text" verification.
- [ ] Commit. (Actual `launchctl load` is a runtime action done during deploy/verification, not a code step.)

## Self-Review
- Spec coverage: capture all incoming ✓(T7), decode ✓(T1), classify ✓(T2,T7), storage+idempotency+purge ✓(T3,T7), rules ✓(T4), API+gating ✓(T5), inbox ✓(T6), launchd+docs ✓(T8). Escalate button → Plan C.
- DRY: shared keyword JSON between TS lib and JS watcher (T2/T7).
- Risk: attributedBody decoder is heuristic — fixtures from real chat.db de-risk it (T1). If a blob fails, row stored with decode_failed:true (still visible).
