#!/usr/bin/env node
/**
 * Direct camp-data seed (NO import UI). Loads a year's roster + schedule from
 * canonical JSON files into Firestore, in the exact shapes the app reads.
 *
 * David hands over raw files (xlsx/docx/csv) the night before camp; those get
 * converted (per-file, by hand/Claude) into the four canonical JSON files this
 * script ingests — keeping the messy parsing separate from the stable load.
 *
 *   <dir>/periods.json   [{ number, name, start_time, end_time }]
 *   <dir>/faculty.json   [{ first_name, last_name, role, email? , id? }]
 *   <dir>/students.json  [{ first_name, last_name, preferred_name?, gender?,
 *                           division, instrument, ensemble?, dorm_building?,
 *                           dorm_room?, email?, cell_phone?, parent_first_name?,
 *                           parent_last_name?, parent_phone?, medical_notes?, id? }]
 *   <dir>/sessions.json  [{ name, type, period_number, ensemble?, instrument?,
 *                           location?, faculty_id?, id? }]
 *
 * `session_students` (enrollments) are DERIVED: a student is enrolled in every
 * session whose `ensemble` matches the student's `ensemble`. Provide
 * <dir>/session_students.json to override the derivation.
 *
 * IDs: periods → `String(number)` (so session.period_id lines up). faculty /
 * students / sessions → the record's `id` if present, else its 1-based index.
 *
 * Usage:
 *   node scripts/seed-camp.mjs <dir>            # dry-run preview (no writes)
 *   node scripts/seed-camp.mjs <dir> --yes      # WRITE to Firestore
 *
 * ⚠️ Writes to the LIVE ttuboc-attendance Firestore. Run the Clear-All-Data
 * button (or this with a clean DB) first for a new year. Reads FB_* from
 * .env.local, same as the app's Admin SDK.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--yes');
const dir = resolve(process.cwd(), argv.find((a) => !a.startsWith('--')) || 'seed-data');

// ─── env ────────────────────────────────────────────────────────────────
try {
  const envLocal = readFileSync(resolve(repoRoot, '.env.local'), 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch {}

const { FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY } = process.env;
if (!FB_PROJECT_ID || !FB_CLIENT_EMAIL || !FB_PRIVATE_KEY) {
  console.error('Missing FB_PROJECT_ID / FB_CLIENT_EMAIL / FB_PRIVATE_KEY (.env.local)');
  process.exit(1);
}

const readArr = (name) => {
  const p = resolve(dir, name);
  if (!existsSync(p)) return null;
  const data = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`${name} must be a JSON array`);
  return data;
};
const nn = (v) => (v === undefined || v === '' ? null : v); // optional → null (never undefined)
const idOf = (rec, i) => String(rec.id ?? i + 1);

// ─── build docs ─────────────────────────────────────────────────────────
const periodsRaw = readArr('periods.json') || [];
const facultyRaw = readArr('faculty.json') || [];
const studentsRaw = readArr('students.json') || [];
const sessionsRaw = readArr('sessions.json') || [];
const enrollmentsRaw = readArr('session_students.json'); // optional override

const periods = periodsRaw.map((p) => ({
  id: String(p.number),
  doc: { number: Number(p.number), name: p.name || `Period ${p.number}`, start_time: p.start_time || '', end_time: p.end_time || '' },
}));

const faculty = facultyRaw.map((f, i) => ({
  id: idOf(f, i),
  doc: { first_name: f.first_name || '', last_name: f.last_name || '', role: f.role || '', email: nn(f.email), created_at: new Date().toISOString() },
}));

const students = studentsRaw.map((s, i) => ({
  id: idOf(s, i),
  doc: {
    first_name: s.first_name || '',
    last_name: s.last_name || '',
    last_initial: (s.last_name || '').charAt(0).toUpperCase(),
    preferred_name: nn(s.preferred_name),
    gender: nn(s.gender),
    division: s.division || 'Commuter',
    instrument: s.instrument || '',
    ensemble: s.ensemble || '',
    chair_number: s.chair_number != null ? Number(s.chair_number) : null,
    dorm_building: nn(s.dorm_building),
    dorm_room: nn(s.dorm_room),
    email: nn(s.email),
    cell_phone: nn(s.cell_phone),
    parent_first_name: nn(s.parent_first_name),
    parent_last_name: nn(s.parent_last_name),
    parent_phone: nn(s.parent_phone),
    medical_notes: nn(s.medical_notes),
    created_at: new Date().toISOString(),
  },
}));

const SESSION_TYPES = new Set(['rehearsal', 'sectional', 'masterclass', 'elective', 'assembly', 'lunch']);
const sessions = sessionsRaw.map((s, i) => {
  const type = String(s.type || '').toLowerCase();
  return {
    id: idOf(s, i),
    doc: {
      name: s.name || '',
      type: SESSION_TYPES.has(type) ? type : 'rehearsal',
      period_id: String(s.period_number ?? s.period_id ?? ''),
      period_number: Number(s.period_number ?? s.period_id ?? 0),
      ensemble: nn(s.ensemble),
      instrument: nn(s.instrument),
      location: nn(s.location),
      faculty_id: nn(s.faculty_id),
    },
  };
});

// Derive enrollments by ensemble unless an explicit file is provided.
let enrollments;
if (enrollmentsRaw) {
  enrollments = enrollmentsRaw.map((e) => ({ id: `${e.session_id}_${e.student_id}`, doc: e }));
} else {
  enrollments = [];
  const byEnsemble = new Map();
  for (const s of sessions) {
    const ens = s.doc.ensemble;
    if (!ens) continue;
    if (!byEnsemble.has(ens)) byEnsemble.set(ens, []);
    byEnsemble.get(ens).push(s);
  }
  for (const st of students) {
    const ens = st.doc.ensemble;
    if (!ens) continue;
    for (const s of byEnsemble.get(ens) || []) {
      enrollments.push({
        id: `${s.id}_${st.id}`,
        doc: {
          session_id: s.id,
          student_id: st.id,
          first_name: st.doc.first_name,
          last_initial: st.doc.last_initial,
          preferred_name: st.doc.preferred_name,
          instrument: st.doc.instrument,
          ensemble: st.doc.ensemble,
          dorm_room: st.doc.dorm_room,
        },
      });
    }
  }
}

// ─── report + write ───────────────────────────────────────────────────────
console.log(`\nProject: ${FB_PROJECT_ID}`);
console.log(`Source:  ${dir}`);
console.log(`Mode:    ${APPLY ? 'APPLYING (writing to Firestore)' : 'dry-run (no writes)'}`);
console.log('Planned writes:');
console.log(`  periods ${periods.length}  faculty ${faculty.length}  students ${students.length}  sessions ${sessions.length}  session_students ${enrollments.length}`);
if (students[0]) console.log(`  sample student: ${students[0].doc.first_name} ${students[0].doc.last_name} (${students[0].id}) — ${students[0].doc.instrument} — ${students[0].doc.ensemble || 'no ensemble'}`);

const withEnsemble = students.filter((s) => s.doc.ensemble).length;
if (!enrollmentsRaw && students.length > 0 && enrollments.length === 0) {
  console.log(`\n⚠️  0 enrollments derived. ${withEnsemble}/${students.length} students have an ensemble, and ${sessions.filter((s) => s.doc.ensemble).length}/${sessions.length} sessions do. Schedules (B5/C1) need these to match — fix the source ensemble values or provide session_students.json before seeding.`);
}

if (!APPLY) {
  console.log('\nDry-run only. Re-run with --yes to write.\n');
  process.exit(0);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FB_PROJECT_ID,
    clientEmail: FB_CLIENT_EMAIL,
    privateKey: FB_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();
const CHUNK = 400;

async function writeAll(name, items) {
  const col = db.collection(name);
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = db.batch();
    for (const it of items.slice(i, i + CHUNK)) batch.set(col.doc(it.id), it.doc);
    await batch.commit();
  }
  console.log(`  wrote ${name}: ${items.length}`);
}

// Dependency order: periods → faculty → students → sessions → session_students.
console.log('\nWriting...');
await writeAll('periods', periods);
await writeAll('faculty', faculty);
await writeAll('students', students);
await writeAll('sessions', sessions);
await writeAll('session_students', enrollments);

// Verify.
console.log('Verifying counts...');
for (const [name, expected] of [['periods', periods.length], ['faculty', faculty.length], ['students', students.length], ['sessions', sessions.length], ['session_students', enrollments.length]]) {
  const got = (await db.collection(name).count().get()).data().count;
  console.log(`  ${name}: ${got}${got === expected ? ' ✓' : ` ✗ expected ${expected}`}`);
}
console.log('\nDone.\n');
process.exit(0);
