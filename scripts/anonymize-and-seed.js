/**
 * Anonymize SQLite data and seed Firestore.
 *
 * Usage:
 *   node scripts/anonymize-and-seed.js
 *
 * Requires:
 *   - SQLite database at ./data/camp.db
 *   - Firebase Admin SDK env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 *   - CAMP_CODE env var
 *
 * What it does:
 *   1. Reads all data from SQLite
 *   2. Anonymizes student PII (last names, emails, phones, medical notes)
 *   3. Uploads to Firestore with denormalized session_students and attendance docs
 */

const Database = require('better-sqlite3');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// ─── Firebase Admin init ────────────────────────────────────────────────

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);

// ─── SQLite connection ──────────────────────────────────────────────────

const sqliteDb = new Database(path.join(__dirname, '..', 'data', 'camp.db'), { readonly: true });

// ─── Fake data lists ────────────────────────────────────────────────────

const FAKE_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
  'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson',
  'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes',
  'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster',
  'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman',
  'Butler', 'Henderson', 'Barnes', 'Gonzales', 'Fisher', 'Vasquez', 'Simmons', 'Graham',
  'Murray', 'Ford', 'Hamilton', 'Shaw', 'Wallace', 'Gibson', 'Holmes', 'Hunt', 'Henry',
  'Palmer', 'Wagner', 'Ferguson', 'Rose', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson',
  'Spencer', 'Gardner', 'Stephens', 'Payne', 'Pierce', 'Berry', 'Matthews', 'Arnold',
  'Wagner', 'Fuller', 'Freeman', 'Webb', 'Tucker', 'Hicks', 'Crawford', 'Harvey', 'Knight',
  'Dixon', 'Grant', 'Wheeler', 'Burke', 'Olson', 'Lawson', 'Ryan', 'Boyd', 'Mason',
  'Lynch', 'Hart', 'Stanley', 'Black', 'Harrison', 'Dean', 'Carr', 'Pena', 'Bates',
  'Little', 'Marsh', 'Holland', 'Chambers', 'Mcdonald', 'Harper', 'Barker', 'Craig',
  'Bishop', 'Curry', 'Mann', 'Blake', 'Powers', 'Moran', 'Quinn', 'Barnett', 'Schroeder',
  'Summers', 'Howell', 'Lowe', 'Monroe', 'Briggs', 'Merritt', 'Hale', 'Frost', 'Soto',
  'Vaughn', 'Fleming', 'Benson', 'Chen', 'Ochoa', 'Chang', 'Wolfe', 'Noble', 'Whitehead',
  'Contreras', 'Mckenzie', 'Mcdaniel', 'Figueroa', 'Dorsey', 'Mccoy', 'Cannon', 'Day',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fakeEmail(firstName, lastName, i) {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
}

function fakePhone() {
  const a = String(Math.floor(Math.random() * 900) + 100);
  const b = String(Math.floor(Math.random() * 9000) + 1000);
  return `555-${a}-${b}`;
}

// ─── Read SQLite data ───────────────────────────────────────────────────

function readAll() {
  const students = sqliteDb.prepare('SELECT * FROM students ORDER BY id').all();
  const faculty = sqliteDb.prepare('SELECT * FROM faculty ORDER BY id').all();
  const periods = sqliteDb.prepare('SELECT * FROM periods ORDER BY number').all();
  const sessions = sqliteDb.prepare('SELECT * FROM sessions ORDER BY id').all();
  const sessionStudents = sqliteDb.prepare('SELECT * FROM session_students ORDER BY id').all();
  const attendance = sqliteDb.prepare('SELECT * FROM attendance ORDER BY id').all();
  return { students, faculty, periods, sessions, sessionStudents, attendance };
}

// ─── Anonymize students ─────────────────────────────────────────────────

function anonymizeStudents(students) {
  return students.map((s, i) => {
    const fakeLast = randomFrom(FAKE_LAST_NAMES);
    return {
      ...s,
      last_name: fakeLast,
      last_initial: fakeLast.charAt(0).toUpperCase(),
      email: s.email ? fakeEmail(s.first_name, fakeLast, i) : null,
      cell_phone: s.cell_phone ? fakePhone() : null,
      parent_first_name: s.parent_first_name ? randomFrom(['Jane', 'John', 'Maria', 'Robert', 'Linda', 'Michael', 'Sarah', 'David', 'Lisa', 'James']) : null,
      parent_last_name: s.parent_last_name ? fakeLast : null,
      parent_phone: s.parent_phone ? fakePhone() : null,
      medical_notes: null,
      additional_info: null,
    };
  });
}

// ─── Firestore batch write helper ───────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function batchWrite(collectionName, docs, idField, startFrom = 0) {
  const BATCH_SIZE = 500;
  let written = startFrom;

  for (let i = startFrom; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const doc of chunk) {
      const docId = String(doc[idField] ?? doc._docId);
      const data = { ...doc };
      delete data[idField];
      delete data._docId;
      batch.set(db.collection(collectionName).doc(docId), data);
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  ${collectionName}: ${written}/${docs.length}`);
    // Throttle to stay under Firestore free-tier quota
    await sleep(1500);
  }
}

// ─── Main seed function ─────────────────────────────────────────────────

async function seed() {
  console.log('Reading SQLite data...');
  const { students, faculty, periods, sessions, sessionStudents, attendance } = readAll();
  console.log(`  Students: ${students.length}, Faculty: ${faculty.length}, Periods: ${periods.length}`);
  console.log(`  Sessions: ${sessions.length}, Enrollments: ${sessionStudents.length}, Attendance: ${attendance.length}`);

  // Anonymize
  console.log('\nAnonymizing student data...');
  const anonStudents = anonymizeStudents(students);

  // Build lookup maps (SQLite id → Firestore doc id)
  // We'll use the SQLite id as the Firestore doc id for simplicity
  const studentMap = new Map(anonStudents.map(s => [s.id, s]));
  const facultyMap = new Map(faculty.map(f => [f.id, f]));
  const periodMap = new Map(periods.map(p => [p.id, p]));
  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  // ─── Upload periods ─────────────────────────────────────────────────
  console.log('\nUploading periods...');
  await batchWrite('periods', periods.map(p => ({
    _docId: String(p.id),
    number: p.number,
    name: p.name,
    start_time: p.start_time,
    end_time: p.end_time,
  })), '_docId');

  // ─── Upload faculty ─────────────────────────────────────────────────
  console.log('\nUploading faculty...');
  await batchWrite('faculty', faculty.map(f => ({
    _docId: String(f.id),
    first_name: f.first_name,
    last_name: f.last_name,
    role: f.role,
    email: f.email || null,
    created_at: f.created_at || new Date().toISOString(),
  })), '_docId');

  // ─── Upload students (anonymized) ───────────────────────────────────
  console.log('\nUploading anonymized students...');
  await batchWrite('students', anonStudents.map(s => ({
    _docId: String(s.id),
    first_name: s.first_name,
    last_name: s.last_name,
    last_initial: s.last_initial,
    preferred_name: s.preferred_name || null,
    gender: s.gender || null,
    division: s.division,
    instrument: s.instrument,
    ensemble: s.ensemble || null,
    chair_number: s.chair_number || null,
    dorm_building: s.dorm_building || null,
    dorm_room: s.dorm_room || null,
    email: s.email,
    cell_phone: s.cell_phone,
    parent_first_name: s.parent_first_name,
    parent_last_name: s.parent_last_name,
    parent_phone: s.parent_phone,
    medical_notes: null,
    additional_info: null,
    created_at: s.created_at || new Date().toISOString(),
  })), '_docId');

  // ─── Upload sessions ────────────────────────────────────────────────
  console.log('\nUploading sessions...');
  await batchWrite('sessions', sessions.map(s => ({
    _docId: String(s.id),
    period_id: String(s.period_id),
    name: s.name,
    type: s.type,
    location: s.location || null,
    faculty_id: s.faculty_id ? String(s.faculty_id) : null,
    ensemble: s.ensemble || null,
    instrument: s.instrument || null,
  })), '_docId');

  // ─── Upload session_students (denormalized) ─────────────────────────
  console.log('\nUploading denormalized session_students...');
  const ssDocs = sessionStudents.map(ss => {
    const student = studentMap.get(ss.student_id);
    return {
      _docId: `${ss.session_id}_${ss.student_id}`,
      session_id: String(ss.session_id),
      student_id: String(ss.student_id),
      first_name: student?.first_name || '',
      last_initial: student?.last_initial || '',
      preferred_name: student?.preferred_name || null,
      instrument: student?.instrument || '',
      ensemble: student?.ensemble || '',
      dorm_room: student?.dorm_room || null,
    };
  });
  await batchWrite('session_students', ssDocs, '_docId');

  // ─── Upload attendance (denormalized) ───────────────────────────────
  console.log('\nUploading denormalized attendance...');
  const attDocs = attendance.map(a => {
    const student = studentMap.get(a.student_id);
    const session = sessionMap.get(a.session_id);
    const period = session ? periodMap.get(session.period_id) : null;
    const fac = session?.faculty_id ? facultyMap.get(session.faculty_id) : null;
    const teacherName = fac ? `${fac.first_name} ${fac.last_name}` : 'TBA';

    return {
      _docId: `${a.date}_${a.session_id}_${a.student_id}`,
      student_id: String(a.student_id),
      session_id: String(a.session_id),
      date: a.date,
      status: a.status,
      marked_at: a.marked_at || new Date().toISOString(),
      marked_by: a.marked_by ? String(a.marked_by) : null,
      // Denormalized student fields
      first_name: student?.first_name || '',
      last_name: student?.last_name || '',
      last_initial: student?.last_initial || '',
      preferred_name: student?.preferred_name || null,
      instrument: student?.instrument || '',
      ensemble: student?.ensemble || '',
      dorm_building: student?.dorm_building || null,
      dorm_room: student?.dorm_room || null,
      email: student?.email || null,
      cell_phone: student?.cell_phone || null,
      parent_first_name: student?.parent_first_name || null,
      parent_last_name: student?.parent_last_name || null,
      parent_phone: student?.parent_phone || null,
      // Denormalized session/period fields
      session_name: session?.name || '',
      period_number: period?.number || 0,
      period_name: period?.name || '',
      teacher_name: teacherName,
    };
  });
  await batchWrite('attendance', attDocs, '_docId');

  // ─── Upload camp config ─────────────────────────────────────────────
  console.log('\nUploading camp config...');
  await db.collection('config').doc('camp').set({
    camp_code: process.env.CAMP_CODE || 'camp2026',
    camp_year: 2026,
    day_dates: {
      Monday: '2026-06-08',
      Tuesday: '2026-06-09',
      Wednesday: '2026-06-10',
      Thursday: '2026-06-11',
      Friday: '2026-06-12',
      Saturday: '2026-06-13',
    },
  });

  console.log('\n✓ Seed complete!');
  console.log(`  Periods: ${periods.length}`);
  console.log(`  Faculty: ${faculty.length}`);
  console.log(`  Students: ${anonStudents.length} (anonymized)`);
  console.log(`  Sessions: ${sessions.length}`);
  console.log(`  Session Students: ${ssDocs.length}`);
  console.log(`  Attendance: ${attDocs.length}`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
