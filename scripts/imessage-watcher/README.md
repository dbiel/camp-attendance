# TTUBOC iMessage Watcher

Read-only Mac Mini watcher that ingests **incoming** texts from
`~/Library/Messages/chat.db` into the camp app's super-admin-only Firestore
`texts` collection, where they surface in `/admin/inbox` with camp/personal
auto-tagging. This is sub-project **B** of the incident command center.

It **never writes to `chat.db`** (opens it read-only + `query_only`) and never
sends or replies to messages. It is a separate, isolated Node project from the
Next.js app because it depends on the native `better-sqlite3` module and must
run locally on the machine that receives the texts (iMessage has no API/cloud
path).

## How it works

- Polls `chat.db` every 15s for rows with `is_from_me = 0` and `ROWID > cursor`.
- Decodes the text: uses `message.text`, or decodes `attributedBody`
  (NSAttributedString `streamtyped` blob) when `text` is NULL. Undecodable rows
  are still stored with `decode_failed: true` so you see "something came in."
- Resolves the sender's handle (phone/email) against the `contacts` collection.
- Classifies **camp vs personal** deterministically (known camp contact, or a
  roster name / dorm building / instrument / keyword hit → camp; else personal;
  empty body from an unknown sender → unknown). Signal lists are shared with the
  web app via `lib/text-classify-data.json`.
- Writes each text to `texts/{message.guid}` (idempotent — replays never dup).
  The cursor advances **only after** a batch writes successfully.
- Cursor is persisted to `cursor.json` and mirrored to `ingest_state/cursor` in
  Firestore (survives a machine rebuild). **First run seeds the cursor to
  `MAX(ROWID)` — no historical backfill.**
- Runs a once-a-day purge of expired texts (`purge_after < now`), skipping any
  text escalated to a still-open Report.

## One-time setup

1. **Node 24.** `better-sqlite3` is a native addon compiled per Node ABI.
   ```sh
   export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
   node --version   # expect v24.x
   ```
2. **Install deps (isolated from the app):**
   ```sh
   cd scripts/imessage-watcher
   npm install
   ```
3. **Firebase creds.** The watcher reuses the app's service account from the
   repo's `../../.env.local` (`FB_PROJECT_ID`, `FB_CLIENT_EMAIL`,
   `FB_PRIVATE_KEY`). No new key. See `.env.example` for optional overrides
   (`CHAT_DB_PATH`, `POLL_INTERVAL_MS`).
4. **Full Disk Access.** macOS guards `~/Library/Messages/`. Grant Full Disk
   Access to the `node` binary that launchd runs (System Settings → Privacy &
   Security → Full Disk Access → add the node binary printed by `install.sh`).
   Without it the watcher logs "chat.db not found / permission denied."
5. **SMS forwarding (optional, David only).** iMessage syncs to the Mac Mini
   automatically; green-bubble **SMS** only arrives if *Text Message Forwarding*
   to the Mac Mini is enabled on the iPhone (Settings → Messages → Text Message
   Forwarding). The watcher captures whatever lands in `chat.db` either way.

## Prove it works without writing (dry run)

```sh
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node index.js --once --dry-run                 # from the live cursor
node index.js --once --dry-run --since=196700  # inspect recent history safely
```

Dry-run reads + decodes + classifies and prints one line per message (body is
redacted to a byte length), but writes **nothing** to Firestore and never
advances the cursor. `--since` is honored only in dry-run.

## Install / start / stop (launchd)

```sh
./install.sh             # template plist, copy to ~/Library/LaunchAgents, start
./install.sh --uninstall # stop + remove

# Manual control
launchctl kickstart -k "gui/$(id -u)/com.ttuboc.imessage-watcher"   # restart
launchctl bootout   "gui/$(id -u)/com.ttuboc.imessage-watcher"      # stop

# Logs
tail -f logs/watcher.out.log
tail -f logs/watcher.err.log
```

## Manual end-to-end verification

1. Start the watcher (`./install.sh`) and `tail -f logs/watcher.out.log`.
2. From another phone, send a test text to David's number (include a camp
   keyword like "sick" to exercise camp tagging).
3. Within ~15s the log shows the new ROWID being processed.
4. Open `/admin/inbox` (as a super admin) — the message appears, newest first,
   tagged `camp`/`personal` with a reason. Re-tag and Dismiss should work.

## Notes / boundaries

- `texts` and `ingest_state` are server-side-only in `firestore.rules`; no
  client ever reads them. The inbox reads via `GET /api/texts` (super_admin).
- The **Escalate** button currently links to `/admin/cases`; wiring it to create
  a Report and call `setTextEscalated()` is sub-project **C**.
- "Immutable" open: `better-sqlite3` does not support SQLite `file:?immutable=1`
  URIs, so we open with `{ readonly: true }` + `PRAGMA query_only` and never
  issue a write — functionally equivalent for our read-only guarantee.
