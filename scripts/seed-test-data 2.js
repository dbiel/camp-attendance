/**
 * Seed script: assigns ensembles to students, links faculty to sessions,
 * enrolls students in sessions, and creates fake attendance data.
 *
 * Run with: node scripts/seed-test-data.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'camp.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Orchestra instruments
const ORCHESTRA_INSTRUMENTS = ['Violin', 'Viola', 'Cello', 'Double Bass'];

// Ensemble distribution for band students
const BAND_ENSEMBLES = ['Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5', 'Band 6', 'Band 7'];
const ORCH_ENSEMBLES = ['Orchestra 1', 'Orchestra 2'];

// Normalize ensemble names in sessions table to match student assignments
const ENSEMBLE_NORMALIZE = {
  'BAND 4': 'Band 4',
  'BAND 5': 'Band 5',
  'BAND 6': 'Band 6',
  'BAND 7': 'Band 7',
  'ORCHESTRA 1': 'Orchestra 1',
  'ORCHESTRA 2': 'Orchestra 2',
};

function run() {
  console.log('=== Seeding test data ===\n');

  // Step 1: Normalize ensemble names in sessions table
  console.log('1. Normalizing ensemble names in sessions...');
  for (const [from, to] of Object.entries(ENSEMBLE_NORMALIZE)) {
    const result = db.prepare('UPDATE sessions SET ensemble = ? WHERE ensemble = ?').run(to, from);
    if (result.changes > 0) {
      console.log(`   ${from} -> ${to} (${result.changes} sessions)`);
    }
  }

  // Step 2: Assign students to ensembles
  console.log('\n2. Assigning students to ensembles...');
  const students = db.prepare('SELECT id, instrument FROM students WHERE ensemble IS NULL').all();
  console.log(`   ${students.length} students need ensemble assignments`);

  const bandStudents = students.filter(s => !ORCHESTRA_INSTRUMENTS.includes(s.instrument));
  const orchStudents = students.filter(s => ORCHESTRA_INSTRUMENTS.includes(s.instrument));

  // Distribute band students roughly evenly across Band 1-7
  const shuffledBand = bandStudents.sort(() => Math.random() - 0.5);
  const bandSize = Math.ceil(shuffledBand.length / BAND_ENSEMBLES.length);

  const updateEnsemble = db.prepare('UPDATE students SET ensemble = ? WHERE id = ?');
  const assignTransaction = db.transaction(() => {
    for (let i = 0; i < shuffledBand.length; i++) {
      const ensembleIdx = Math.min(Math.floor(i / bandSize), BAND_ENSEMBLES.length - 1);
      updateEnsemble.run(BAND_ENSEMBLES[ensembleIdx], shuffledBand[i].id);
    }

    // Distribute orchestra students across Orch 1 and 2
    const shuffledOrch = orchStudents.sort(() => Math.random() - 0.5);
    const orchSize = Math.ceil(shuffledOrch.length / ORCH_ENSEMBLES.length);
    for (let i = 0; i < shuffledOrch.length; i++) {
      const ensembleIdx = Math.min(Math.floor(i / orchSize), ORCH_ENSEMBLES.length - 1);
      updateEnsemble.run(ORCH_ENSEMBLES[ensembleIdx], shuffledOrch[i].id);
    }
  });
  assignTransaction();
  console.log(`   Assigned ${shuffledBand.length} band students and ${orchStudents.length} orchestra students`);

  // Step 3: Link faculty to sessions using faculty_schedule.json
  console.log('\n3. Linking faculty to sessions...');
  const facultySchedule = require('../data/faculty_schedule.json');
  const allFaculty = db.prepare('SELECT id, first_name, last_name FROM faculty').all();
  const allSessions = db.prepare('SELECT id, name, period_id, type FROM sessions').all();
  const periods = db.prepare('SELECT id, number FROM periods').all();
  const periodNumToId = {};
  for (const p of periods) periodNumToId[p.number] = p.id;

  let facultyLinked = 0;
  const updateFaculty = db.prepare('UPDATE sessions SET faculty_id = ? WHERE id = ?');

  const linkTransaction = db.transaction(() => {
    for (const entry of facultySchedule) {
      // Find matching faculty
      const fac = allFaculty.find(
        f => f.first_name === entry.faculty_first && f.last_name === entry.faculty_last
      );
      if (!fac) continue;

      const periodId = periodNumToId[entry.period_number];
      if (!periodId) continue;

      // Try to match session by activity name and period
      const actLower = entry.activity.toLowerCase();
      const matchingSession = allSessions.find(s => {
        if (s.period_id !== periodId) return false;
        const sessLower = s.name.toLowerCase();
        // Direct name match
        if (sessLower === actLower) return true;
        // Partial match (e.g. "Band 1 Rehearsal" contains "rehearsal")
        if (actLower.includes(sessLower) || sessLower.includes(actLower)) return true;
        // Match rehearsal activities to rehearsal sessions
        if (actLower.includes('rehearsal') && sessLower.includes('rehearsal')) {
          // Check same band number
          const actMatch = actLower.match(/band (\d)/);
          const sessMatch = sessLower.match(/band (\d)/);
          if (actMatch && sessMatch && actMatch[1] === sessMatch[1]) return true;
        }
        return false;
      });

      if (matchingSession) {
        updateFaculty.run(fac.id, matchingSession.id);
        facultyLinked++;
      }
    }
  });
  linkTransaction();
  console.log(`   Linked ${facultyLinked} faculty-session assignments`);

  // For any sessions still without faculty, assign a random faculty member
  const unlinkedSessions = db.prepare("SELECT id FROM sessions WHERE faculty_id IS NULL AND type != 'lunch'").all();
  if (unlinkedSessions.length > 0) {
    const assignRandom = db.transaction(() => {
      for (const sess of unlinkedSessions) {
        const randomFac = allFaculty[Math.floor(Math.random() * allFaculty.length)];
        updateFaculty.run(randomFac.id, sess.id);
      }
    });
    assignRandom();
    console.log(`   Assigned random faculty to ${unlinkedSessions.length} remaining sessions`);
  }

  // Step 4: Enroll students in sessions based on their ensemble
  console.log('\n4. Enrolling students in sessions...');
  const studentsWithEnsembles = db.prepare('SELECT id, ensemble, instrument FROM students').all();
  const sessionsAll = db.prepare('SELECT id, ensemble, type, period_id, instrument FROM sessions').all();
  const insertEnrollment = db.prepare('INSERT OR IGNORE INTO session_students (session_id, student_id) VALUES (?, ?)');

  let enrollmentCount = 0;
  const enrollTransaction = db.transaction(() => {
    for (const student of studentsWithEnsembles) {
      if (!student.ensemble) continue;

      for (const session of sessionsAll) {
        let shouldEnroll = false;

        if (session.type === 'assembly') {
          // Everyone attends assembly
          shouldEnroll = true;
        } else if (session.ensemble === student.ensemble) {
          if (session.type === 'rehearsal' || session.type === 'lunch') {
            // All ensemble members attend rehearsal and lunch
            shouldEnroll = true;
          } else if (session.type === 'sectional' || session.type === 'masterclass') {
            // Sectionals/masterclasses - enroll all ensemble members
            // (In reality these are instrument-specific, but for test data this works)
            shouldEnroll = true;
          } else if (session.type === 'elective') {
            // Randomly assign ~30% of ensemble to each elective
            shouldEnroll = Math.random() < 0.3;
          }
        }

        if (shouldEnroll) {
          insertEnrollment.run(session.id, student.id);
          enrollmentCount++;
        }
      }
    }
  });
  enrollTransaction();
  console.log(`   Created ${enrollmentCount} enrollments`);

  // Step 5: Generate fake attendance data for testing
  console.log('\n5. Generating fake attendance data...');
  const testDates = [
    '2026-06-08', // Monday
    '2026-06-09', // Tuesday
    '2026-06-10', // Wednesday
  ];

  const enrollments = db.prepare(`
    SELECT ss.student_id, ss.session_id, sess.faculty_id
    FROM session_students ss
    JOIN sessions sess ON ss.session_id = sess.id
  `).all();

  const insertAttendance = db.prepare(`
    INSERT OR IGNORE INTO attendance (student_id, session_id, date, status, marked_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  let attendanceCount = 0;
  const attendanceTransaction = db.transaction(() => {
    for (const date of testDates) {
      for (const enrollment of enrollments) {
        // 85% present, 10% absent, 5% tardy
        const rand = Math.random();
        let status;
        if (rand < 0.85) status = 'present';
        else if (rand < 0.95) status = 'absent';
        else status = 'tardy';

        insertAttendance.run(
          enrollment.student_id,
          enrollment.session_id,
          date,
          status,
          enrollment.faculty_id || null
        );
        attendanceCount++;
      }
    }
  });
  attendanceTransaction();
  console.log(`   Created ${attendanceCount} attendance records across ${testDates.length} days`);

  // Print summary
  console.log('\n=== Summary ===');
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get();
  const withEnsemble = db.prepare('SELECT COUNT(*) as count FROM students WHERE ensemble IS NOT NULL').get();
  const totalEnrollments = db.prepare('SELECT COUNT(*) as count FROM session_students').get();
  const totalAttendance = db.prepare('SELECT COUNT(*) as count FROM attendance').get();
  const sessionsWithFaculty = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE faculty_id IS NOT NULL').get();
  const facultyWithSessions = db.prepare('SELECT COUNT(DISTINCT faculty_id) as count FROM sessions WHERE faculty_id IS NOT NULL').get();

  console.log(`Students with ensembles: ${withEnsemble.count}/${totalStudents.count}`);
  console.log(`Sessions with faculty: ${sessionsWithFaculty.count}`);
  console.log(`Faculty with sessions: ${facultyWithSessions.count}`);
  console.log(`Total enrollments: ${totalEnrollments.count}`);
  console.log(`Total attendance records: ${totalAttendance.count}`);
  console.log(`\nTest dates with data: ${testDates.join(', ')}`);
  console.log('(M=Mon, T=Tue, W=Wed in the app)');

  db.close();
}

run();
