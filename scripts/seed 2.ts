import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '..', 'data', 'camp.db');

// Delete existing DB for clean seed
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('Deleted existing database');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    preferred_name TEXT,
    gender TEXT,
    division TEXT NOT NULL DEFAULT 'Commuter Camper',
    instrument TEXT NOT NULL,
    ensemble TEXT,
    chair_number INTEGER,
    dorm_building TEXT,
    dorm_room TEXT,
    email TEXT,
    cell_phone TEXT,
    parent_first_name TEXT,
    parent_last_name TEXT,
    parent_phone TEXT,
    medical_notes TEXT,
    additional_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS faculty (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('rehearsal', 'sectional', 'masterclass', 'elective', 'assembly', 'lunch')),
    location TEXT,
    faculty_id INTEGER REFERENCES faculty(id),
    ensemble TEXT,
    instrument TEXT
  );

  CREATE TABLE IF NOT EXISTS session_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    UNIQUE(session_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'tardy')),
    marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    marked_by INTEGER REFERENCES faculty(id),
    UNIQUE(student_id, session_id, date)
  );

  CREATE TABLE IF NOT EXISTS schedule_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ensemble TEXT NOT NULL,
    instrument TEXT,
    session_id INTEGER NOT NULL REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_students_ensemble ON students(ensemble);
  CREATE INDEX IF NOT EXISTS idx_students_instrument ON students(instrument);
  CREATE INDEX IF NOT EXISTS idx_students_dorm ON students(dorm_building);
  CREATE INDEX IF NOT EXISTS idx_sessions_period ON sessions(period_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_faculty ON sessions(faculty_id);
  CREATE INDEX IF NOT EXISTS idx_session_students_session ON session_students(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_students_student ON session_students(student_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
`);

console.log('Tables created');

// Load JSON files
const dataDir = path.join(__dirname, '..', 'data');
const periodsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'periods.json'), 'utf-8'));
const facultyData = JSON.parse(fs.readFileSync(path.join(dataDir, 'faculty.json'), 'utf-8'));
const studentsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'students.json'), 'utf-8'));
const sessionsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf-8'));
const facultyScheduleData = JSON.parse(fs.readFileSync(path.join(dataDir, 'faculty_schedule.json'), 'utf-8'));

// 1. Seed periods
const insertPeriod = db.prepare('INSERT INTO periods (number, name, start_time, end_time) VALUES (?, ?, ?, ?)');
const seedPeriods = db.transaction(() => {
  for (const p of periodsData) {
    insertPeriod.run(p.number, p.name, p.start_time, p.end_time);
  }
});
seedPeriods();
console.log(`Seeded ${periodsData.length} periods`);

// 2. Seed faculty
const insertFaculty = db.prepare('INSERT INTO faculty (first_name, last_name, role, email) VALUES (?, ?, ?, ?)');
const seedFaculty = db.transaction(() => {
  for (const f of facultyData) {
    insertFaculty.run(f.first_name, f.last_name, f.role, f.email || null);
  }
});
seedFaculty();
console.log(`Seeded ${facultyData.length} faculty`);

// 3. Seed students
const insertStudent = db.prepare(`
  INSERT INTO students (first_name, last_name, preferred_name, gender, division, instrument, ensemble,
    dorm_building, dorm_room, email, cell_phone, parent_first_name, parent_last_name, parent_phone, medical_notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const seedStudents = db.transaction(() => {
  for (const s of studentsData) {
    insertStudent.run(
      s.first_name, s.last_name, s.preferred_name || null, s.gender || null,
      s.division || 'Commuter Camper', s.instrument, s.ensemble || null,
      s.dorm_building || null, s.dorm_room || null, s.email || null,
      s.cell_phone || null, s.parent_first_name || null, s.parent_last_name || null,
      s.parent_phone || null, s.medical_notes || null
    );
  }
});
seedStudents();
console.log(`Seeded ${studentsData.length} students`);

// Build lookup maps
const periodMap = new Map<number, number>(); // period_number -> period_id
for (const row of db.prepare('SELECT id, number FROM periods').all() as any[]) {
  periodMap.set(row.number, row.id);
}

const facultyMap = new Map<string, number>(); // "first last" -> faculty_id
for (const row of db.prepare('SELECT id, first_name, last_name FROM faculty').all() as any[]) {
  facultyMap.set(`${row.first_name} ${row.last_name}`.toLowerCase(), row.id);
}

// 4. Seed sessions
const insertSession = db.prepare(`
  INSERT INTO sessions (period_id, name, type, location, faculty_id, ensemble, instrument)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const seedSessions = db.transaction(() => {
  for (const s of sessionsData) {
    const periodId = periodMap.get(s.period_number);
    if (!periodId) {
      console.warn(`  Warning: No period found for period_number ${s.period_number}, skipping session "${s.name}"`);
      continue;
    }

    // Try to match faculty by name
    let facultyId: number | null = null;
    if (s.faculty_name) {
      facultyId = facultyMap.get(s.faculty_name.toLowerCase()) || null;
    }

    insertSession.run(
      periodId, s.name, s.type, s.location || null,
      facultyId, s.ensemble || null, s.instrument || null
    );
  }
});
seedSessions();
const sessionCount = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
console.log(`Seeded ${sessionCount} sessions`);

// 5. Link faculty to sessions via faculty_schedule
const updateSessionFaculty = db.prepare(`
  UPDATE sessions SET faculty_id = ?, location = COALESCE(?, location)
  WHERE period_id = ? AND (
    name LIKE '%' || ? || '%'
    OR (ensemble IS NOT NULL AND name LIKE '%' || ensemble || '%')
  ) AND faculty_id IS NULL
`);

let linkedCount = 0;
const linkFaculty = db.transaction(() => {
  for (const fs of facultyScheduleData) {
    const periodId = periodMap.get(fs.period_number);
    if (!periodId) continue;

    const facultyKey = `${fs.faculty_first} ${fs.faculty_last}`.toLowerCase();
    const facultyId = facultyMap.get(facultyKey);
    if (!facultyId) continue;

    // Try to find matching session and assign faculty
    const sessions = db.prepare(`
      SELECT id FROM sessions WHERE period_id = ? AND faculty_id IS NULL AND name LIKE ?
    `).all(periodId, `%${fs.activity}%`) as any[];

    for (const sess of sessions) {
      db.prepare('UPDATE sessions SET faculty_id = ?, location = COALESCE(?, location) WHERE id = ?')
        .run(facultyId, fs.location || null, sess.id);
      linkedCount++;
    }
  }
});
linkFaculty();
console.log(`Linked ${linkedCount} faculty-session assignments`);

// Summary
const stats = {
  periods: (db.prepare('SELECT COUNT(*) as c FROM periods').get() as any).c,
  faculty: (db.prepare('SELECT COUNT(*) as c FROM faculty').get() as any).c,
  students: (db.prepare('SELECT COUNT(*) as c FROM students').get() as any).c,
  sessions: (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c,
  studentsWithEnsemble: (db.prepare("SELECT COUNT(*) as c FROM students WHERE ensemble IS NOT NULL AND ensemble != ''").get() as any).c,
};

console.log('\n=== Seed Complete ===');
console.log(`  Periods:  ${stats.periods}`);
console.log(`  Faculty:  ${stats.faculty}`);
console.log(`  Students: ${stats.students} (${stats.studentsWithEnsemble} with ensemble assigned)`);
console.log(`  Sessions: ${stats.sessions}`);
console.log(`\nDatabase saved to: ${DB_PATH}`);

db.close();
