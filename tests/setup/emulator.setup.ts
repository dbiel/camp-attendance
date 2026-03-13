/**
 * Firebase Emulator setup helpers for integration and security tests.
 *
 * Expects the Firebase Emulator Suite to be running:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *
 * Usage in test files:
 *   import { seedTestData, clearFirestore, getAdminToken } from './emulator.setup';
 */

import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { makeStudent, makeFaculty, makePeriod, makeSession } from './test-data';

// Point Admin SDK at emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

let _app: ReturnType<typeof initializeApp> | null = null;

function getTestApp() {
  if (_app) return _app;
  // Delete any existing apps to avoid conflicts
  for (const app of getApps()) {
    deleteApp(app);
  }
  _app = initializeApp({
    projectId: 'demo-test-project',
  }, 'test-app');
  return _app;
}

export function getTestDb() {
  return getFirestore(getTestApp());
}

export function getTestAuth() {
  return getAuth(getTestApp());
}

/**
 * Clear all Firestore data in the emulator.
 */
export async function clearFirestore() {
  const response = await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-test-project/databases/(default)/documents',
    { method: 'DELETE' }
  );
  if (!response.ok) {
    console.warn('Failed to clear Firestore emulator:', response.statusText);
  }
}

/**
 * Create admin user in Auth emulator and return an ID token.
 */
export async function getAdminToken(): Promise<string> {
  const auth = getTestAuth();

  // Create or get admin user
  let uid: string;
  try {
    const user = await auth.getUserByEmail('admin@test.com');
    uid = user.uid;
  } catch {
    const user = await auth.createUser({
      email: 'admin@test.com',
      password: 'testpassword123',
    });
    uid = user.uid;
  }

  // Create a custom token and exchange it for an ID token via the emulator REST API
  const customToken = await auth.createCustomToken(uid);

  // Exchange custom token for ID token via Auth emulator
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = await res.json();
  return data.idToken;
}

/**
 * Seed the Firestore emulator with test data.
 * Returns IDs of created documents for use in tests.
 */
export async function seedTestData() {
  const db = getTestDb();

  // Create config
  await db.collection('config').doc('camp').set({
    camp_code: 'test-camp-2026',
    camp_year: 2026,
    day_dates: {
      Monday: '2026-06-08',
      Tuesday: '2026-06-09',
      Wednesday: '2026-06-10',
      Thursday: '2026-06-11',
      Friday: '2026-06-12',
    },
  });

  // Create periods
  const periodIds: string[] = [];
  const periods = [
    makePeriod({ number: 1, name: 'Period 1', start_time: '08:00', end_time: '08:50' }),
    makePeriod({ number: 2, name: 'Period 2', start_time: '09:00', end_time: '09:50' }),
    makePeriod({ number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' }),
  ];
  for (const p of periods) {
    const ref = await db.collection('periods').add(p);
    periodIds.push(ref.id);
  }

  // Create faculty
  const facultyIds: string[] = [];
  const facultyData = [
    makeFaculty({ first_name: 'Dr. Sarah', last_name: 'Williams', role: 'Director' }),
    makeFaculty({ first_name: 'Prof. James', last_name: 'Miller', role: 'Assistant Director' }),
    makeFaculty({ first_name: 'Dr. Lisa', last_name: 'Chen', role: 'Instructor' }),
    makeFaculty({ first_name: 'Mr. Carlos', last_name: 'Rivera', role: 'Instructor' }),
    makeFaculty({ first_name: 'Ms. Amy', last_name: 'Taylor', role: 'TA' }),
  ];
  for (const f of facultyData) {
    const ref = await db.collection('faculty').add({ ...f, created_at: new Date().toISOString() });
    facultyIds.push(ref.id);
  }

  // Create sessions
  const sessionIds: string[] = [];
  const sessionData = [
    makeSession({ name: 'Concert Band Rehearsal', period_id: periodIds[0], faculty_id: facultyIds[0], ensemble: 'Concert Band' }),
    makeSession({ name: 'Jazz Ensemble', type: 'rehearsal', period_id: periodIds[1], faculty_id: facultyIds[1], ensemble: 'Jazz Ensemble' }),
    makeSession({ name: 'Flute Sectional', type: 'sectional', period_id: periodIds[2], faculty_id: facultyIds[2], instrument: 'Flute' }),
    makeSession({ name: 'Trumpet Masterclass', type: 'masterclass', period_id: periodIds[0], faculty_id: facultyIds[3], instrument: 'Trumpet' }),
    makeSession({ name: 'Music Theory Elective', type: 'elective', period_id: periodIds[1], faculty_id: facultyIds[4] }),
  ];
  for (const s of sessionData) {
    const ref = await db.collection('sessions').add(s);
    sessionIds.push(ref.id);
  }

  // Create students
  const studentIds: string[] = [];
  const studentData = [
    makeStudent({ first_name: 'Alice', last_name: 'Anderson', instrument: 'Flute', ensemble: 'Concert Band' }),
    makeStudent({ first_name: 'Bob', last_name: 'Brown', instrument: 'Trumpet', ensemble: 'Concert Band' }),
    makeStudent({ first_name: 'Carol', last_name: 'Clark', instrument: 'Clarinet', ensemble: 'Jazz Ensemble' }),
    makeStudent({ first_name: 'Dave', last_name: 'Davis', instrument: 'Trombone', ensemble: 'Concert Band' }),
    makeStudent({ first_name: 'Eve', last_name: 'Evans', instrument: 'Flute', ensemble: 'Jazz Ensemble' }),
    makeStudent({ first_name: 'Frank', last_name: 'Foster', instrument: 'Percussion', ensemble: 'Concert Band' }),
    makeStudent({ first_name: 'Grace', last_name: 'Garcia', instrument: 'Violin', ensemble: 'Symphony Orchestra' }),
    makeStudent({ first_name: 'Henry', last_name: 'Harris', instrument: 'Viola', ensemble: 'Symphony Orchestra' }),
    makeStudent({ first_name: 'Iris', last_name: 'Irving', instrument: 'Cello', ensemble: 'Symphony Orchestra' }),
    makeStudent({ first_name: 'Jack', last_name: 'Jones', instrument: 'Oboe', ensemble: 'Concert Band' }),
  ];
  for (const s of studentData) {
    const ref = await db.collection('students').add({
      ...s,
      last_initial: s.last_name.charAt(0).toUpperCase(),
      created_at: new Date().toISOString(),
    });
    studentIds.push(ref.id);
  }

  // Create session_students (enroll students in sessions)
  // Enroll first 5 students in session 0 (Concert Band Rehearsal)
  for (let i = 0; i < 5; i++) {
    const docId = `${sessionIds[0]}_${studentIds[i]}`;
    const student = studentData[i];
    await db.collection('session_students').doc(docId).set({
      session_id: sessionIds[0],
      student_id: studentIds[i],
      first_name: student.first_name,
      last_initial: student.last_name.charAt(0).toUpperCase(),
      preferred_name: student.preferred_name || null,
      instrument: student.instrument,
      ensemble: student.ensemble,
      dorm_room: student.dorm_room || null,
    });
  }

  // Create some attendance records
  await db.collection('attendance').doc(`2026-06-08_${sessionIds[0]}_${studentIds[0]}`).set({
    student_id: studentIds[0],
    session_id: sessionIds[0],
    date: '2026-06-08',
    status: 'present',
    marked_at: new Date().toISOString(),
    marked_by: 'teacher',
    first_name: 'Alice',
    last_name: 'Anderson',
    last_initial: 'A',
    preferred_name: null,
    instrument: 'Flute',
    ensemble: 'Concert Band',
    dorm_building: 'Chitwood',
    dorm_room: '204',
    email: 'alice.johnson@fakeemail.test',
    cell_phone: '555-100-0001',
    parent_first_name: 'Bob',
    parent_last_name: 'Johnson',
    parent_phone: '555-200-0001',
    session_name: 'Concert Band Rehearsal',
    period_number: 1,
    period_name: 'Period 1',
    teacher_name: 'Dr. Sarah Williams',
  });

  await db.collection('attendance').doc(`2026-06-08_${sessionIds[0]}_${studentIds[1]}`).set({
    student_id: studentIds[1],
    session_id: sessionIds[0],
    date: '2026-06-08',
    status: 'absent',
    marked_at: new Date().toISOString(),
    marked_by: 'teacher',
    first_name: 'Bob',
    last_name: 'Brown',
    last_initial: 'B',
    preferred_name: null,
    instrument: 'Trumpet',
    ensemble: 'Concert Band',
    dorm_building: 'Chitwood',
    dorm_room: '205',
    email: 'bob.brown@fakeemail.test',
    cell_phone: '555-100-0002',
    parent_first_name: 'Jane',
    parent_last_name: 'Brown',
    parent_phone: '555-200-0002',
    session_name: 'Concert Band Rehearsal',
    period_number: 1,
    period_name: 'Period 1',
    teacher_name: 'Dr. Sarah Williams',
  });

  return {
    periodIds,
    facultyIds,
    sessionIds,
    studentIds,
    testDate: '2026-06-08',
  };
}
