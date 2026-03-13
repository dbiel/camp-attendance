/**
 * Resume seeding attendance records from where the previous run failed.
 * The first run uploaded ~7000/36099 records before hitting quota limits.
 * This script skips already-uploaded records and throttles writes.
 */

const Database = require('better-sqlite3');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const sqliteDb = new Database(path.join(__dirname, '..', 'data', 'camp.db'), { readonly: true });

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // Read what's already seeded — get the student anonymization map from Firestore
  console.log('Loading student map from Firestore...');
  const studentsSnap = await db.collection('students').get();
  const studentMap = new Map();
  studentsSnap.forEach(doc => studentMap.set(doc.id, doc.data()));
  console.log(`  Found ${studentMap.size} students in Firestore`);

  // Load sessions and periods from Firestore
  const sessionsSnap = await db.collection('sessions').get();
  const sessionMap = new Map();
  sessionsSnap.forEach(doc => sessionMap.set(doc.id, doc.data()));

  const facultySnap = await db.collection('faculty').get();
  const facultyMap = new Map();
  facultySnap.forEach(doc => facultyMap.set(doc.id, doc.data()));

  const periodsSnap = await db.collection('periods').get();
  const periodMap = new Map();
  periodsSnap.forEach(doc => periodMap.set(doc.id, doc.data()));

  // Check how many attendance docs exist
  // We'll just count by querying a sample
  console.log('Checking existing attendance count...');
  const existingSnap = await db.collection('attendance').count().get();
  const existingCount = existingSnap.data().count;
  console.log(`  ${existingCount} attendance docs already in Firestore`);

  // Read all attendance from SQLite
  const attendance = sqliteDb.prepare('SELECT * FROM attendance ORDER BY id').all();
  console.log(`  ${attendance.length} total attendance records in SQLite`);

  const SKIP = existingCount; // skip already-uploaded
  const BATCH_SIZE = 500;
  let written = 0;

  console.log(`  Skipping first ${SKIP}, uploading remaining ${attendance.length - SKIP}...`);

  for (let i = SKIP; i < attendance.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = attendance.slice(i, i + BATCH_SIZE);

    for (const a of chunk) {
      const student = studentMap.get(String(a.student_id));
      const session = sessionMap.get(String(a.session_id));
      const period = session ? periodMap.get(session.period_id) : null;
      const fac = session?.faculty_id ? facultyMap.get(session.faculty_id) : null;
      const teacherName = fac ? `${fac.first_name} ${fac.last_name}` : 'TBA';

      const docId = `${a.date}_${a.session_id}_${a.student_id}`;
      batch.set(db.collection('attendance').doc(docId), {
        student_id: String(a.student_id),
        session_id: String(a.session_id),
        date: a.date,
        status: a.status,
        marked_at: a.marked_at || new Date().toISOString(),
        marked_by: a.marked_by ? String(a.marked_by) : null,
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
        session_name: session?.name || '',
        period_number: period?.number || 0,
        period_name: period?.name || '',
        teacher_name: teacherName,
      });
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  attendance: ${SKIP + written}/${attendance.length}`);
    await sleep(1500);
  }

  // Upload camp config
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

  console.log(`\nDone! Uploaded ${written} remaining attendance records.`);
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
