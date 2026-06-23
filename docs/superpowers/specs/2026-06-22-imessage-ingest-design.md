# iMessage Ingest (read-only) — Design

> **Status:** Approved 2026-06-22. Sub-project B of four (A = access tiers; B = this;
> C = escalation/Reports/links; D = security audit). Depends on A's `super_admin`
> role for visibility gating. Read-only: this never sends messages.

---

## Purpose

Automate today's manual intake. Right now faculty text David; he pastes or
screenshots those texts into the app and Claude parses them. This sub-project
captures incoming texts on the Mac Mini automatically and surfaces them in a
super-admin-only inbox, so escalation (C) starts from a real message instead of a
paste.

## Constraints & ground truth (verified)

- The Mac Mini already receives David's texts; `~/Library/Messages/chat.db` is
  readable by this process (Full Disk Access granted). 195k+ messages; newest
  incoming `ROWID` is the natural delta cursor.
- iMessage syncs automatically; **SMS (green-bubble) requires Text Message
  Forwarding** (iPhone → Mac Mini), a manual toggle only David can set. The
  watcher captures whatever lands in `chat.db` regardless.
- iMessage is closed — there is no API and no cloud path. Capture MUST run as a
  local process on the Mac Mini. This is why B is a separate component from the
  Firebase-hosted web app.

## Architecture

```
chat.db (read-only)
   │  poll every 15s, ROWID > cursor, is_from_me = 0
   ▼
scripts/imessage-watcher/  (Node, launchd-managed, on Mac Mini)
   │  decode text, resolve sender→contact, classify camp/personal
   ▼
Firestore `texts` collection  (super-admin-only, server-side reads only)
   │
   ▼
GET /api/texts  (super_admin)  ──►  app/admin/inbox  (camp default, toggle personal)
                                        │
                                        └─►  "Escalate to Report"  (hands off to C)
```

### Watcher (`scripts/imessage-watcher/`)
- Node script, run by **launchd** (`com.ttuboc.imessage-watcher`, KeepAlive,
  RunAtLoad). A `.plist` template + install script live in the same dir.
- Opens `chat.db` **read-only and immutable** (`file:<path>?mode=ro&immutable=1`)
  so it never locks Messages or mutates the DB.
- Polls every **15s**. Cursor = last processed `message.ROWID`, persisted in a
  local `cursor.json` (and mirrored to a Firestore `ingest_state/cursor` doc so
  it survives a machine rebuild). On first run, seeds the cursor to the current
  MAX(ROWID) so it does NOT backfill 195k historical messages — capture starts
  "from now."
- Per new incoming row: extract text; if `message.text` is NULL, decode
  `attributedBody` (NSAttributedString typedstream) with a minimal extractor;
  on failure store `body: ""` + `decode_failed: true` + `has_attachments`.
- Resolve sender: `handle.id` (phone E.164 or email) → `normalizePhone` →
  `findContactByPhone` against the existing `contacts` collection. Attach
  `sender_contact_id` + `sender_name` when matched.
- Loads Firebase Admin creds from the repo's `.env.local` (`FB_PROJECT_ID`,
  `FB_CLIENT_EMAIL`, `FB_PRIVATE_KEY`) — reuses existing service account; no new
  key required.
- Idempotent: writes use `message.guid` as the Firestore doc ID, so a replay
  (cursor reset) never duplicates.
- Runs a **daily purge pass** (see Retention).

### Classification (camp vs personal)
Deterministic, cheap, no per-message LLM call:
1. Sender matches a known contact with role `faculty` / `dorm_staff` / `admin`
   → **camp**.
2. Otherwise score body against signals: any roster student name, dorm building
   names, instrument terms, and keywords (sick, hurt, missing, late, parent,
   camp, nurse, room). ≥1 strong signal → **camp**; else → **personal**.
3. No match either way → **unknown** (shown in camp/triage view, since a missed
   real report is worse than a stray personal text).

Store `tag` (`camp` | `personal` | `unknown`) and `tag_reason` (short string) so
David can see *why* it was tagged and re-tag in the UI. Misclassification is
recoverable — the inbox lets him flip a text's tag, and re-tagging never deletes.

### Data model — `texts` collection (super-admin-only)
```
id            : message.guid (idempotency key)
rowid         : number          // delta cursor reference
service       : string          // 'iMessage' | 'SMS' | 'RCS' | etc. (whatever chat.db reports)
sender_handle : string          // raw handle.id (phone/email)
sender_contact_id : string | null
sender_name   : string | null   // denormalized from contact
body          : string
has_attachments : boolean
decode_failed : boolean
tag           : 'camp' | 'personal' | 'unknown'
tag_reason    : string
sent_at       : string (ISO)    // from message.date
created_at    : string (ISO)    // ingest time
escalated_case_id : string | null  // set by C when escalated
purge_after   : string (ISO)    // camp end + 30d, for retention
```
Firestore rules: `texts` is **server-side only** (`allow read, write: if false`)
— identical to `cases`. All reads go through `GET /api/texts` (super_admin).

### Inbox UI (`app/admin/inbox/`)
- Super-admin-only page (lookup_admin gets 403 — texts are super-admin-only per A).
- `GET /api/texts?tag=camp` default; toggle for `personal` / `all`. Client polls
  every 10s (consistent with the app's server-side-read pattern; no client
  Firestore access to `texts`).
- Each row: sender (name or number), service badge, body, time, tag chip.
  Actions: **Escalate to Report** (→ C), **re-tag** (camp/personal), **dismiss**.
- Empty/again states handled; newest first.

### Retention / purge
- Each text stamped `purge_after = campEndDate + 30 days` at ingest (reads camp
  config `end_date`; if unset, defaults to ingest + 90d as a safety bound).
- The watcher's **daily purge pass** deletes any `texts` doc whose `purge_after`
  is in the past. Deterministic, local, no extra infra. Escalated texts are
  retained until their linked Report is resolved + purge window (so evidence
  isn't lost mid-Report).

## Error handling
- chat.db unreadable / locked → log, retry next tick (never crash-loop hard;
  launchd KeepAlive + internal backoff).
- Firestore write failure → keep cursor un-advanced for that batch so the row is
  retried (idempotent guid write makes retry safe).
- Decode failure → store the row with `decode_failed: true` rather than dropping
  it, so David still sees "something came in from X" and can check his phone.

## Testing
- Unit: `attributedBody` decoder (sample blobs → expected text); classifier
  (contact-match, keyword hits, no-match → unknown); cursor advance/idempotency
  (same guid twice → one doc); `purge_after` computation from camp end date.
- Unit: `GET /api/texts` role gating (super_admin 200; lookup_admin/teacher 403),
  tag filter behavior.
- Manual (documented in the watcher README): send a test text to the Mac Mini,
  confirm it appears in the inbox within ~15s, tagged correctly.

## Out of scope
- Sending/replying to texts (handled by C's outbound links + existing tap-to-text).
- Media/attachment download (only `has_attachments` flagged).
- Per-message LLM classification (deterministic classifier is sufficient; the
  LLM is used at escalation time in C, not for every inbound text).
