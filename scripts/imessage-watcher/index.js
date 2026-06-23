#!/usr/bin/env node
/**
 * TTUBOC iMessage watcher (read-only).
 *
 * Polls ~/Library/Messages/chat.db for new INCOMING messages by ROWID cursor,
 * decodes the text (attributedBody when message.text is NULL), resolves the
 * sender against the camp `contacts` collection, classifies camp/personal,
 * and upserts each into the Firestore `texts` collection keyed by message.guid
 * (idempotent). Runs a once-a-day purge of expired texts.
 *
 * NEVER writes to chat.db. Opens it read-only + immutable.
 *
 * Flags:
 *   --once       run a single poll pass and exit (no loop)
 *   --dry-run    decode + classify + print, but write NOTHING to Firestore and
 *                do NOT advance the cursor. Safe to run anytime.
 *
 * Env (loaded from the repo .env.local; see .env.example):
 *   FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY
 *   CHAT_DB_PATH   (optional; defaults to ~/Library/Messages/chat.db)
 *   POLL_INTERVAL_MS (optional; default 15000)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
import { decodeAttributedBody } from './lib/decode-attributed-body.js';
import { classifyText } from './lib/classify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ── Args ────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);
const ARGS = new Set(ARGV);
const ONCE = ARGS.has('--once');
const DRY_RUN = ARGS.has('--dry-run');
// --since=<rowid>: start the cursor at an explicit ROWID. Intended for
// dry-run inspection of recent history; ignored unless --dry-run is also set
// (so it can never cause a backfill write to Firestore).
const SINCE_ARG = ARGV.find((a) => a.startsWith('--since='));
const SINCE = SINCE_ARG ? Number(SINCE_ARG.slice('--since='.length)) : null;

// ── Env ─────────────────────────────────────────────────────────────────
// Load the repo .env.local (reuse the app's service account; no new key).
(async () => {
  try {
    const dotenv = (await import('dotenv')).default;
    dotenv.config({ path: join(REPO_ROOT, '.env.local') });
    dotenv.config({ path: join(__dirname, '.env') }); // optional watcher overrides
  } catch {
    // dotenv optional; env may already be set by launchd.
  }
})();

const CHAT_DB_PATH =
  process.env.CHAT_DB_PATH || join(homedir(), 'Library', 'Messages', 'chat.db');
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);
const CURSOR_FILE = join(__dirname, 'cursor.json');

const APPLE_EPOCH_OFFSET_S = 978307200; // 2001-01-01 → Unix seconds.

// ── Logging ───────────────────────────────────────────────────────────────
function log(...a) {
  console.log(new Date().toISOString(), ...a);
}
function logErr(...a) {
  console.error(new Date().toISOString(), ...a);
}

// ── chat.db (read-only, immutable) ─────────────────────────────────────────
function openChatDb() {
  // better-sqlite3 does NOT parse `file:...?immutable=1` URIs (it treats the
  // whole string as a literal path), so we open read-only via the supported
  // `readonly` flag and additionally set `query_only` — together these prevent
  // any write/lock to the live Messages DB. We never issue a write statement.
  const db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma('query_only = true');
  return db;
}

/** Apple-epoch (ns, or legacy s) → ISO string. */
function appleDateToIso(raw) {
  if (raw == null) return new Date().toISOString();
  const n = Number(raw);
  // Post-Sierra chat.db stores nanoseconds; older stores seconds.
  const seconds = n > 1e11 ? n / 1e9 : n;
  return new Date((seconds + APPLE_EPOCH_OFFSET_S) * 1000).toISOString();
}

const NEW_ROWS_SQL = `
  SELECT m.ROWID            AS rowid,
         m.guid             AS guid,
         m.text             AS text,
         m.attributedBody   AS attributedBody,
         m.service          AS service,
         m.date             AS date,
         m.cache_has_attachments AS has_attachments,
         h.id               AS handle
  FROM message m
  LEFT JOIN handle h ON m.handle_id = h.ROWID
  WHERE m.is_from_me = 0 AND m.ROWID > ?
  ORDER BY m.ROWID ASC
`;

function maxRowid(db) {
  const row = db.prepare('SELECT MAX(ROWID) AS m FROM message').get();
  return row?.m ?? 0;
}

// ── Cursor ─────────────────────────────────────────────────────────────────
function readLocalCursor() {
  try {
    if (existsSync(CURSOR_FILE)) {
      const { rowid } = JSON.parse(readFileSync(CURSOR_FILE, 'utf8'));
      if (Number.isFinite(rowid)) return rowid;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function writeLocalCursor(rowid) {
  writeFileSync(CURSOR_FILE, JSON.stringify({ rowid, updated_at: new Date().toISOString() }));
}

// ── Phone normalize (mirror of lib/contacts.ts normalizePhone) ──────────────
function normalizePhone(raw) {
  const trimmed = String(raw || '').trim();
  if (/^\+1\d{10}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// ── purge_after (mirror of lib/texts.ts computePurgeAfter) ───────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
function computePurgeAfter(campEndDate, sentAt) {
  if (campEndDate) {
    const base = new Date(`${campEndDate}T00:00:00.000Z`).getTime();
    return new Date(base + 30 * DAY_MS).toISOString();
  }
  return new Date(new Date(sentAt).getTime() + 90 * DAY_MS).toISOString();
}

// ── Firebase Admin (lazy; not loaded in dry-run) ─────────────────────────────
let _adminDb = null;
async function getAdminDb() {
  if (_adminDb) return _adminDb;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = process.env.FB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FB_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FB_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(
    /\\n/g,
    '\n'
  );
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing FB_PROJECT_ID / FB_CLIENT_EMAIL / FB_PRIVATE_KEY in env');
  }
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  _adminDb = getFirestore();
  return _adminDb;
}

async function loadCampContext(adminDb) {
  // Camp end date (for purge_after) + dorm building names + roster names.
  let campEndDate = null;
  let dormNames = [];
  let rosterNames = [];
  try {
    const cfg = await adminDb.collection('config').doc('camp').get();
    if (cfg.exists) campEndDate = cfg.data()?.end_date ?? null;
  } catch (e) {
    logErr('camp config read failed:', e.message);
  }
  try {
    const students = await adminDb.collection('students').get();
    const dorms = new Set();
    const names = new Set();
    students.forEach((d) => {
      const s = d.data();
      if (s.dorm_building) dorms.add(String(s.dorm_building));
      if (s.first_name) names.add(String(s.first_name));
      if (s.preferred_name) names.add(String(s.preferred_name));
      if (s.last_name) names.add(String(s.last_name));
    });
    dormNames = [...dorms];
    rosterNames = [...names];
  } catch (e) {
    logErr('roster read failed:', e.message);
  }
  return { campEndDate, dormNames, rosterNames };
}

async function findContactByPhone(adminDb, handle) {
  const phone = normalizePhone(handle);
  if (!phone) return null;
  const snap = await adminDb.collection('contacts').where('phone', '==', phone).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ── Build a TextDoc from a chat.db row ───────────────────────────────────────
function buildTextDoc(row, { contact, campEndDate }) {
  let body = row.text;
  let decodeFailed = false;
  if (body == null || body === '') {
    if (row.attributedBody) {
      body = decodeAttributedBody(Buffer.from(row.attributedBody));
      if (!body) decodeFailed = true;
    } else {
      body = '';
    }
  }
  const sentAt = appleDateToIso(row.date);
  const senderRole = contact?.role ?? null;
  // The classifier itself doesn't take roster/dorm here; the caller passes them.
  return {
    guid: row.guid,
    rowid: row.rowid,
    service: row.service || 'unknown',
    sender_handle: row.handle || '',
    sender_contact_id: contact?.id ?? null,
    sender_name: contact?.name ?? null,
    body,
    has_attachments: !!row.has_attachments,
    decode_failed: decodeFailed,
    sent_at: sentAt,
    purge_after: computePurgeAfter(campEndDate, sentAt),
    _senderRole: senderRole, // internal; stripped before write
  };
}

async function upsertText(adminDb, doc) {
  const { guid, _senderRole, ...rest } = doc;
  void _senderRole;
  const ref = adminDb.collection('texts').doc(guid);
  const existing = await ref.get();
  const prevEscalated = existing.exists ? existing.data()?.escalated_case_id ?? null : null;
  await ref.set({
    ...rest,
    created_at: new Date().toISOString(),
    escalated_case_id: prevEscalated,
  });
}

async function purgeExpiredTexts(adminDb, now = new Date()) {
  const snap = await adminDb
    .collection('texts')
    .where('purge_after', '<', now.toISOString())
    .get();
  let deleted = 0;
  for (const d of snap.docs) {
    if (d.data()?.escalated_case_id) continue;
    await adminDb.collection('texts').doc(d.id).delete();
    deleted++;
  }
  return deleted;
}

// ── One poll pass ────────────────────────────────────────────────────────────
async function pollOnce(db, ctx) {
  // Resolve the cursor on first pass: local file → Firestore → MAX(ROWID).
  if (ctx.cursor == null) {
    // --since only honored in dry-run, for inspecting recent history safely.
    if (DRY_RUN && Number.isFinite(SINCE)) {
      ctx.cursor = SINCE;
      log(`[DRY] Using --since cursor=${SINCE}.`);
    }
  }
  if (ctx.cursor == null) {
    let cursor = readLocalCursor();
    if (cursor == null && !DRY_RUN && ctx.adminDb) {
      try {
        const stateDoc = await ctx.adminDb.collection('ingest_state').doc('cursor').get();
        if (stateDoc.exists && Number.isFinite(stateDoc.data()?.rowid)) {
          cursor = stateDoc.data().rowid;
        }
      } catch (e) {
        logErr('ingest_state read failed:', e.message);
      }
    }
    if (cursor == null) {
      cursor = maxRowid(db); // first run: start "from now", no backfill.
      log(`No cursor found — seeding to MAX(ROWID)=${cursor} (no historical backfill).`);
    }
    ctx.cursor = cursor;
  }

  const rows = db.prepare(NEW_ROWS_SQL).all(ctx.cursor);
  if (rows.length === 0) {
    if (DRY_RUN) log('No new incoming messages since ROWID', ctx.cursor);
    return;
  }

  log(`${rows.length} new incoming message(s) since ROWID ${ctx.cursor}`);

  let maxSeen = ctx.cursor;
  for (const row of rows) {
    maxSeen = Math.max(maxSeen, row.rowid);
    let contact = null;
    if (!DRY_RUN || ctx.adminDb) {
      try {
        if (ctx.adminDb) contact = await findContactByPhone(ctx.adminDb, row.handle);
      } catch (e) {
        logErr('contact lookup failed:', e.message);
      }
    }
    const doc = buildTextDoc(row, { contact, campEndDate: ctx.campEndDate });
    const cls = classifyText({
      body: doc.body,
      senderContactRole: doc._senderRole,
      rosterNames: ctx.rosterNames,
      dormNames: ctx.dormNames,
    });
    doc.tag = cls.tag;
    doc.tag_reason = cls.reason;

    if (DRY_RUN) {
      // Redact body — print length only.
      const len = Buffer.byteLength(doc.body || '');
      log(
        `[DRY] rowid=${row.rowid} ${doc.service} from=${doc.sender_name || doc.sender_handle}` +
          ` tag=${doc.tag} (${doc.tag_reason})` +
          ` body_len=${len}${doc.decode_failed ? ' DECODE_FAILED' : ''}` +
          `${doc.has_attachments ? ' +attachment' : ''}`
      );
    } else {
      try {
        await upsertText(ctx.adminDb, doc);
      } catch (e) {
        logErr(`write failed for rowid=${row.rowid}; cursor NOT advanced. ${e.message}`);
        return; // leave cursor un-advanced so the batch is retried.
      }
    }
  }

  // Advance cursor only after the whole batch succeeded (or in dry-run, never).
  if (!DRY_RUN) {
    ctx.cursor = maxSeen;
    writeLocalCursor(maxSeen);
    try {
      await ctx.adminDb
        .collection('ingest_state')
        .doc('cursor')
        .set({ rowid: maxSeen, updated_at: new Date().toISOString() });
    } catch (e) {
      logErr('ingest_state mirror failed (local cursor still saved):', e.message);
    }
  } else {
    log(`[DRY] would advance cursor to ${maxSeen} (not persisted).`);
  }
}

// ── Daily purge ──────────────────────────────────────────────────────────────
async function maybePurge(ctx) {
  if (DRY_RUN) return;
  const today = new Date().toISOString().slice(0, 10);
  if (ctx.lastPurgeDay === today) return;
  ctx.lastPurgeDay = today;
  try {
    const n = await purgeExpiredTexts(ctx.adminDb);
    if (n > 0) log(`Purged ${n} expired text(s).`);
  } catch (e) {
    logErr('purge pass failed:', e.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log(`iMessage watcher starting. once=${ONCE} dry-run=${DRY_RUN} db=${CHAT_DB_PATH}`);
  if (!existsSync(CHAT_DB_PATH)) {
    logErr(`chat.db not found at ${CHAT_DB_PATH}. Grant Full Disk Access and check the path.`);
    process.exit(1);
  }

  const ctx = { cursor: null, adminDb: null, campEndDate: null, dormNames: [], rosterNames: [] };

  if (!DRY_RUN) {
    ctx.adminDb = await getAdminDb();
  } else {
    // Dry-run still benefits from contact/roster context if creds exist, but
    // must never write. Try to load read-only context; tolerate failure.
    try {
      ctx.adminDb = await getAdminDb();
    } catch (e) {
      log('Dry-run without Firebase creds — classifying without contact/roster context.', e.message);
    }
  }

  if (ctx.adminDb) {
    const camp = await loadCampContext(ctx.adminDb);
    ctx.campEndDate = camp.campEndDate;
    ctx.dormNames = camp.dormNames;
    ctx.rosterNames = camp.rosterNames;
    log(
      `Loaded camp context: end_date=${ctx.campEndDate || '(none)'} ` +
        `dorms=${ctx.dormNames.length} rosterNames=${ctx.rosterNames.length}`
    );
  }

  const runPass = async () => {
    let db;
    try {
      db = openChatDb();
      await pollOnce(db, ctx);
      await maybePurge(ctx);
    } catch (e) {
      logErr('poll pass error (will retry next tick):', e.message);
    } finally {
      try {
        db?.close();
      } catch {
        /* ignore */
      }
    }
  };

  await runPass();

  if (ONCE) {
    log('Done (--once).');
    return;
  }

  log(`Entering poll loop every ${POLL_INTERVAL_MS}ms.`);
  setInterval(runPass, POLL_INTERVAL_MS);
}

main().catch((e) => {
  logErr('fatal:', e);
  process.exit(1);
});
