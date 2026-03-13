import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Student, Faculty, Period, Session, SessionStudent, Attendance, ScheduleTemplate } from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'camp.db');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Get or create database instance
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    ensureDataDir();
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  const database = db!;

  // Check if tables exist
  const tableCheck = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='students'"
  ).all();

  if (tableCheck.length === 0) {
    // Create all tables
    database.exec(`
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

    // Seed periods
    seedPeriods(database);
  }
}

function seedPeriods(database: Database.Database) {
  const periods = [
    { number: 1, name: 'Period 1', start_time: '08:00', end_time: '08:50' },
    { number: 2, name: 'Period 2', start_time: '09:00', end_time: '09:50' },
    { number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' },
    { number: 4, name: 'Period 4A', start_time: '11:00', end_time: '11:50' },
    { number: 5, name: 'Period 4B', start_time: '12:00', end_time: '12:50' },
    { number: 6, name: 'Period 5', start_time: '13:00', end_time: '13:50' },
    { number: 7, name: 'Period 6', start_time: '14:00', end_time: '14:50' },
    { number: 8, name: 'Assembly', start_time: '15:00', end_time: '15:50' },
    { number: 9, name: 'Period 7', start_time: '16:00', end_time: '16:50' },
    { number: 10, name: 'Period 8', start_time: '17:00', end_time: '18:00' },
  ];

  const insert = database.prepare(`
    INSERT OR IGNORE INTO periods (number, name, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = database.transaction(() => {
    for (const period of periods) {
      insert.run(period.number, period.name, period.start_time, period.end_time);
    }
  });

  transaction();
}

// Student operations
export function getStudents(): Student[] {
  const database = getDb();
  return database.prepare('SELECT * FROM students ORDER BY last_name, first_name').all() as Student[];
}

export function getStudent(id: number): Student | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM students WHERE id = ?').get(id) as Student | undefined;
}

export function createStudent(data: Omit<Student, 'id' | 'created_at'>): number {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO students (
      first_name, last_name, preferred_name, gender, division, instrument, ensemble,
      chair_number, dorm_building, dorm_room, email, cell_phone, parent_first_name,
      parent_last_name, parent_phone, medical_notes, additional_info
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.first_name, data.last_name, data.preferred_name || null, data.gender || null,
    data.division, data.instrument, data.ensemble, data.chair_number || null,
    data.dorm_building || null, data.dorm_room || null, data.email || null,
    data.cell_phone || null, data.parent_first_name || null, data.parent_last_name || null,
    data.parent_phone || null, data.medical_notes || null, data.additional_info || null
  );
  return result.lastInsertRowid as number;
}

export function updateStudent(id: number, data: Partial<Omit<Student, 'id' | 'created_at'>>): void {
  const database = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    updates.push(`${key} = ?`);
    values.push(value === undefined ? null : value);
  }

  if (updates.length === 0) return;

  values.push(id);
  database.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteStudent(id: number): void {
  const database = getDb();
  database.prepare('DELETE FROM students WHERE id = ?').run(id);
}

// Faculty operations
export function getFaculty(): Faculty[] {
  const database = getDb();
  return database.prepare('SELECT * FROM faculty ORDER BY last_name, first_name').all() as Faculty[];
}

export function getFacultyMember(id: number): Faculty | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM faculty WHERE id = ?').get(id) as Faculty | undefined;
}

export function createFaculty(data: Omit<Faculty, 'id' | 'created_at'>): number {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO faculty (first_name, last_name, role, email)
    VALUES (?, ?, ?, ?)
  `).run(data.first_name, data.last_name, data.role, data.email || null);
  return result.lastInsertRowid as number;
}

export function updateFaculty(id: number, data: Partial<Omit<Faculty, 'id' | 'created_at'>>): void {
  const database = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    updates.push(`${key} = ?`);
    values.push(value === undefined ? null : value);
  }

  if (updates.length === 0) return;

  values.push(id);
  database.prepare(`UPDATE faculty SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteFaculty(id: number): void {
  const database = getDb();
  database.prepare('DELETE FROM faculty WHERE id = ?').run(id);
}

// Period operations
export function getPeriods(): Period[] {
  const database = getDb();
  return database.prepare('SELECT * FROM periods ORDER BY number').all() as Period[];
}

export function getPeriod(id: number): Period | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM periods WHERE id = ?').get(id) as Period | undefined;
}

// Session operations
export function getSessions(): Session[] {
  const database = getDb();
  return database.prepare('SELECT * FROM sessions ORDER BY id').all() as Session[];
}

export function getSession(id: number): Session | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function createSession(data: Omit<Session, 'id'>): number {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO sessions (period_id, name, type, location, faculty_id, ensemble, instrument)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.period_id, data.name, data.type, data.location || null, data.faculty_id || null,
    data.ensemble || null, data.instrument || null
  );
  return result.lastInsertRowid as number;
}

export function updateSession(id: number, data: Partial<Omit<Session, 'id'>>): void {
  const database = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    updates.push(`${key} = ?`);
    values.push(value === undefined ? null : value);
  }

  if (updates.length === 0) return;

  values.push(id);
  database.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteSession(id: number): void {
  const database = getDb();
  database.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// Session Students operations
export function getSessionStudents(sessionId: number): SessionStudent[] {
  const database = getDb();
  return database.prepare('SELECT * FROM session_students WHERE session_id = ?').all(sessionId) as SessionStudent[];
}

export function addStudentToSession(sessionId: number, studentId: number): void {
  const database = getDb();
  database.prepare('INSERT OR IGNORE INTO session_students (session_id, student_id) VALUES (?, ?)').run(sessionId, studentId);
}

export function removeStudentFromSession(sessionId: number, studentId: number): void {
  const database = getDb();
  database.prepare('DELETE FROM session_students WHERE session_id = ? AND student_id = ?').run(sessionId, studentId);
}

// Attendance operations
export function getAttendance(studentId: number, sessionId: number, date: string): Attendance | undefined {
  const database = getDb();
  return database.prepare('SELECT * FROM attendance WHERE student_id = ? AND session_id = ? AND date = ?').get(studentId, sessionId, date) as Attendance | undefined;
}

export function getSessionAttendance(sessionId: number, date: string): Attendance[] {
  const database = getDb();
  return database.prepare('SELECT * FROM attendance WHERE session_id = ? AND date = ?').all(sessionId, date) as Attendance[];
}

export function markAttendance(studentId: number, sessionId: number, date: string, status: 'present' | 'absent' | 'tardy', markedBy?: number): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO attendance (student_id, session_id, date, status, marked_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id, session_id, date) DO UPDATE SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP
  `).run(studentId, sessionId, date, status, markedBy || null, status, markedBy || null);
}

export function getAttendanceReport(date: string, status?: 'absent' | 'tardy'): any[] {
  const database = getDb();

  let query = `
    SELECT
      s.id as student_id,
      s.first_name,
      s.last_name,
      s.instrument,
      s.ensemble,
      s.dorm_building,
      s.dorm_room,
      s.parent_phone,
      s.cell_phone,
      s.email,
      s.parent_first_name,
      s.parent_last_name,
      sess.name as session_name,
      sess.id as session_id,
      a.status,
      p.number as period_number,
      p.name as period_name,
      COALESCE(f.first_name || ' ' || f.last_name, 'TBA') as teacher_name,
      a.date
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    JOIN sessions sess ON a.session_id = sess.id
    JOIN periods p ON sess.period_id = p.id
    LEFT JOIN faculty f ON sess.faculty_id = f.id
    WHERE a.date = ?
  `;

  const params: any[] = [date];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  } else {
    query += " AND a.status IN ('absent', 'tardy')";
  }

  query += ' ORDER BY p.number, s.ensemble, s.last_name, s.first_name';

  return database.prepare(query).all(...params) as any[];
}

// Faculty Sessions operations
export function getFacultySessions(facultyId: number, date?: string): any[] {
  const database = getDb();

  let query = `
    SELECT
      sess.id,
      sess.name,
      sess.type,
      sess.location,
      p.number as period_number,
      p.start_time,
      p.end_time,
      p.name as period_name,
      sess.ensemble,
      sess.instrument,
      COUNT(DISTINCT ss.student_id) as total_students,
      COUNT(DISTINCT CASE WHEN a.status = 'present' THEN ss.student_id END) as present_count,
      COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN ss.student_id END) as absent_count,
      COUNT(DISTINCT CASE WHEN a.status = 'tardy' THEN ss.student_id END) as tardy_count
    FROM sessions sess
    JOIN periods p ON sess.period_id = p.id
    LEFT JOIN session_students ss ON sess.id = ss.session_id
    LEFT JOIN attendance a ON ss.student_id = a.student_id AND sess.id = a.session_id AND a.date = ?
    WHERE sess.faculty_id = ?
    GROUP BY sess.id
    ORDER BY p.number
  `;

  const todayDate = date || getTodayDate();
  return database.prepare(query).all(todayDate, facultyId) as any[];
}

export function getStudentSchedule(studentId: number, date?: string): any[] {
  const database = getDb();

  const query = `
    SELECT
      sess.id as session_id,
      sess.name,
      sess.type,
      sess.location,
      p.number as period_number,
      p.start_time,
      p.end_time,
      p.name as period_name,
      COALESCE(f.first_name || ' ' || f.last_name, 'TBA') as teacher_name,
      COALESCE(a.status, 'unmarked') as attendance_status,
      a.date
    FROM session_students ss
    JOIN sessions sess ON ss.session_id = sess.id
    JOIN periods p ON sess.period_id = p.id
    LEFT JOIN faculty f ON sess.faculty_id = f.id
    LEFT JOIN attendance a ON ss.student_id = a.student_id AND sess.id = a.session_id AND a.date = ?
    WHERE ss.student_id = ?
    ORDER BY p.number
  `;

  const todayDate = date || getTodayDate();
  return database.prepare(query).all(todayDate, studentId) as any[];
}

// Utility functions
export function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function getCurrentPeriod(): number | null {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  const database = getDb();
  const period = database.prepare('SELECT id, number FROM periods WHERE start_time <= ? AND end_time > ? ORDER BY number DESC LIMIT 1')
    .get(currentTime, currentTime) as { id: number; number: number } | undefined;

  return period?.number ?? null;
}

export function getDailyStats(date: string): any {
  const database = getDb();

  const query = `
    SELECT
      COUNT(DISTINCT CASE WHEN a.status = 'present' THEN s.id END) as present,
      COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN s.id END) as absent,
      COUNT(DISTINCT CASE WHEN a.status = 'tardy' THEN s.id END) as tardy,
      COUNT(DISTINCT CASE WHEN a.id IS NULL THEN s.id END) as unmarked,
      COUNT(DISTINCT s.id) as total
    FROM students s
    LEFT JOIN session_students ss ON s.id = ss.student_id
    LEFT JOIN attendance a ON s.id = a.student_id AND ss.session_id = a.session_id AND a.date = ?
  `;

  return database.prepare(query).get(date) as any;
}
