import { randomInt } from 'node:crypto';
import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  Student, Faculty, Period, Session, SessionStudent,
  Attendance, AttendanceDenormalized, SessionStudentDenormalized,
  AttendanceReport, CampConfig,
  FacultySessionRow, StudentScheduleRow, ScheduleGridRow,
  SessionWithPeriod, DailyStats,
} from './types';
import { getTodayDate, getCurrentTimeHHMM, deriveDayDates } from './date';
import { invalidateCampConfigCache, loadActiveCampServer } from './camp-config';

// Re-export for back-compat — existing callers import getTodayDate from '@/lib/firestore'.
export { getTodayDate } from './date';

// ─── Collection references ─────────────────────────────────────────────

const studentsCol = () => adminDb.collection('students');
const facultyCol = () => adminDb.collection('faculty');
const periodsCol = () => adminDb.collection('periods');
const sessionsCol = () => adminDb.collection('sessions');
const sessionStudentsCol = () => adminDb.collection('session_students');
const attendanceCol = () => adminDb.collection('attendance');

// ─── Student operations ─────────────────────────────────────────────────

export async function getStudents(): Promise<Student[]> {
  const snap = await studentsCol().get();
  const students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
  students.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  return students;
}

export async function getStudent(id: string): Promise<Student | undefined> {
  const doc = await studentsCol().doc(id).get();
  if (!doc.exists) return undefined;
  return { id: doc.id, ...doc.data() } as Student;
}

export async function createStudent(data: Omit<Student, 'id' | 'created_at' | 'last_initial'>): Promise<string> {
  const lastInitial = data.last_name ? data.last_name.charAt(0).toUpperCase() : '';
  const docRef = await studentsCol().add({
    ...data,
    last_initial: lastInitial,
    created_at: new Date().toISOString(),
  });
  return docRef.id;
}

export async function updateStudent(id: string, data: Partial<Omit<Student, 'id' | 'created_at'>>): Promise<void> {
  if (Object.keys(data).length === 0) return;
  // Recompute last_initial if last_name is being updated
  if (data.last_name) {
    data.last_initial = data.last_name.charAt(0).toUpperCase();
  }
  await studentsCol().doc(id).update(data);
}

export async function deleteStudent(id: string): Promise<void> {
  await studentsCol().doc(id).delete();
}

// ─── Faculty operations ─────────────────────────────────────────────────

export async function getFaculty(): Promise<Faculty[]> {
  const snap = await facultyCol().get();
  const faculty = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Faculty));
  faculty.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  return faculty;
}

export async function getFacultyMember(id: string): Promise<Faculty | undefined> {
  const doc = await facultyCol().doc(id).get();
  if (!doc.exists) return undefined;
  return { id: doc.id, ...doc.data() } as Faculty;
}

export async function createFaculty(data: Omit<Faculty, 'id' | 'created_at'>): Promise<string> {
  const docRef = await facultyCol().add({
    ...data,
    created_at: new Date().toISOString(),
  });
  return docRef.id;
}

export async function updateFaculty(id: string, data: Partial<Omit<Faculty, 'id' | 'created_at'>>): Promise<void> {
  if (Object.keys(data).length === 0) return;
  await facultyCol().doc(id).update(data);
}

export async function deleteFaculty(id: string): Promise<void> {
  await facultyCol().doc(id).delete();
}

// ─── Period operations ──────────────────────────────────────────────────

export async function getPeriods(): Promise<Period[]> {
  const snap = await periodsCol().orderBy('number').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Period));
}

export async function getPeriod(id: string): Promise<Period | undefined> {
  const doc = await periodsCol().doc(id).get();
  if (!doc.exists) return undefined;
  return { id: doc.id, ...doc.data() } as Period;
}

// ─── Session operations ─────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  const snap = await sessionsCol().orderBy('period_id').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
}

export async function getSession(id: string): Promise<Session | undefined> {
  const doc = await sessionsCol().doc(id).get();
  if (!doc.exists) return undefined;
  return { id: doc.id, ...doc.data() } as Session;
}

export async function createSession(data: Omit<Session, 'id'>): Promise<string> {
  const docRef = await sessionsCol().add({ ...data });
  return docRef.id;
}

export async function updateSession(id: string, data: Partial<Omit<Session, 'id'>>): Promise<void> {
  if (Object.keys(data).length === 0) return;
  await sessionsCol().doc(id).update(data);
}

export async function deleteSession(id: string): Promise<void> {
  await sessionsCol().doc(id).delete();
}

// ─── Session Students operations ────────────────────────────────────────

export async function getSessionStudents(sessionId: string): Promise<SessionStudentDenormalized[]> {
  const snap = await sessionStudentsCol()
    .where('session_id', '==', sessionId)
    .get();
  const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SessionStudentDenormalized));
  docs.sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
  return docs;
}

export async function addStudentToSession(sessionId: string, studentId: string): Promise<void> {
  // Fetch student for denormalized fields
  const student = await getStudent(studentId);
  if (!student) throw new Error(`Student ${studentId} not found`);

  const docId = `${sessionId}_${studentId}`;
  await sessionStudentsCol().doc(docId).set({
    session_id: sessionId,
    student_id: studentId,
    first_name: student.first_name,
    last_initial: student.last_initial,
    preferred_name: student.preferred_name || null,
    instrument: student.instrument,
    ensemble: student.ensemble,
    dorm_room: student.dorm_room || null,
  });
}

export async function removeStudentFromSession(sessionId: string, studentId: string): Promise<void> {
  const docId = `${sessionId}_${studentId}`;
  await sessionStudentsCol().doc(docId).delete();
}

// ─── Attendance operations ──────────────────────────────────────────────

export async function getAttendance(studentId: string, sessionId: string, date: string): Promise<Attendance | undefined> {
  const docId = `${date}_${sessionId}_${studentId}`;
  const doc = await attendanceCol().doc(docId).get();
  if (!doc.exists) return undefined;
  return { id: doc.id, ...doc.data() } as Attendance;
}

export async function getSessionAttendance(sessionId: string, date: string): Promise<Attendance[]> {
  // Use single where clause + client filter to avoid needing composite index
  const snap = await attendanceCol()
    .where('session_id', '==', sessionId)
    .get();
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as Attendance))
    .filter(a => a.date === date);
}

export async function markAttendance(
  studentId: string,
  sessionId: string,
  date: string,
  status: 'present' | 'absent' | 'tardy',
  markedBy?: string
): Promise<void> {
  // Fetch student + session + period + faculty for denormalization
  const [student, session] = await Promise.all([
    getStudent(studentId),
    getSession(sessionId),
  ]);

  if (!student || !session) {
    throw new Error('Student or session not found');
  }

  const [period, faculty] = await Promise.all([
    getPeriod(session.period_id),
    session.faculty_id ? getFacultyMember(session.faculty_id) : Promise.resolve(undefined),
  ]);

  const docId = `${date}_${sessionId}_${studentId}`;
  const teacherName = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'TBA';

  await attendanceCol().doc(docId).set({
    student_id: studentId,
    session_id: sessionId,
    date,
    status,
    marked_at: new Date().toISOString(),
    marked_by: markedBy || null,
    // Display-only non-PII student fields
    first_name: student.first_name,
    last_name: student.last_name,
    last_initial: student.last_initial,
    preferred_name: student.preferred_name || null,
    instrument: student.instrument,
    ensemble: student.ensemble,
    // Denormalized session/period fields
    session_name: session.name,
    period_number: period?.number ?? 0,
    period_name: period?.name ?? '',
    teacher_name: teacherName,
  } satisfies Omit<AttendanceDenormalized, 'id'>);
}

// NOTE: Existing attendance docs in production still carry denormalized
// parent/contact fields from the prior schema. Run a one-shot cleanup
// migration before deploying this change — unset the legacy fields on
// every doc in the `attendance` collection. New writes no longer include
// them.

/**
 * Delete an attendance record. Returns true if a doc existed and was removed,
 * false if no doc was present (so callers can distinguish if they care).
 * Doc ID convention matches `markAttendance`: `${date}_${sessionId}_${studentId}`.
 */
export async function deleteAttendance(
  studentId: string,
  sessionId: string,
  date: string
): Promise<boolean> {
  const docId = `${date}_${sessionId}_${studentId}`;
  const ref = attendanceCol().doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

// ─── Batch attendance (UX Task 9) ───────────────────────────────────────

export interface AttendanceBatchItem {
  student_id: string;
  session_id: string;
  date: string;
  status: 'present' | 'absent' | 'tardy';
}

export interface AttendanceBatchResult {
  written: number;
  skipped: number;
  errors: Array<{ index: number; reason: string }>;
}

/**
 * Write many attendance docs in chunked Firestore WriteBatches.
 *
 * - Chunks writes at 400 ops (Firestore hard limit is 500; 400 leaves headroom).
 * - Pre-fetches the distinct student/session/period/faculty docs once so the
 *   denormalized fields match single-item `markAttendance` exactly.
 * - `markedBy` is derived by the caller (the route handler) from the verified
 *   identity — never accept a client-supplied value here.
 * - Items whose student_id/session_id don't resolve are reported in `errors`
 *   and counted as skipped; the rest of the batch still writes.
 */
export async function markAttendanceBatch(
  items: AttendanceBatchItem[],
  markedBy: string
): Promise<AttendanceBatchResult> {
  const result: AttendanceBatchResult = { written: 0, skipped: 0, errors: [] };
  if (items.length === 0) return result;

  // Pre-fetch the distinct students + sessions in parallel.
  const studentIds = Array.from(new Set(items.map(i => i.student_id)));
  const sessionIds = Array.from(new Set(items.map(i => i.session_id)));

  const [students, sessions] = await Promise.all([
    Promise.all(studentIds.map(id => getStudent(id))),
    Promise.all(sessionIds.map(id => getSession(id))),
  ]);

  const studentMap = new Map<string, Student>();
  studentIds.forEach((id, idx) => {
    const s = students[idx];
    if (s) studentMap.set(id, s);
  });

  const sessionMap = new Map<string, Session>();
  sessionIds.forEach((id, idx) => {
    const s = sessions[idx];
    if (s) sessionMap.set(id, s);
  });

  // Pre-fetch distinct period + faculty referenced by resolved sessions.
  const periodIds = Array.from(
    new Set(Array.from(sessionMap.values()).map(s => s.period_id))
  );
  const facultyIds = Array.from(
    new Set(
      Array.from(sessionMap.values())
        .map(s => s.faculty_id)
        .filter((id): id is string => !!id)
    )
  );

  const [periods, facultyList] = await Promise.all([
    Promise.all(periodIds.map(id => getPeriod(id))),
    Promise.all(facultyIds.map(id => getFacultyMember(id))),
  ]);

  const periodMap = new Map<string, Period>();
  periodIds.forEach((id, idx) => {
    const p = periods[idx];
    if (p) periodMap.set(id, p);
  });

  const facultyMap = new Map<string, Faculty>();
  facultyIds.forEach((id, idx) => {
    const f = facultyList[idx];
    if (f) facultyMap.set(id, f);
  });

  const markedAt = new Date().toISOString();
  const CHUNK_SIZE = 400;

  // Build (docRef, data) pairs for all resolvable items, record skip reasons.
  const writes: Array<{ docId: string; data: Omit<AttendanceDenormalized, 'id'> }> = [];
  items.forEach((it, index) => {
    const student = studentMap.get(it.student_id);
    const session = sessionMap.get(it.session_id);
    if (!student || !session) {
      result.skipped += 1;
      result.errors.push({
        index,
        reason: !student ? 'student not found' : 'session not found',
      });
      return;
    }
    const period = periodMap.get(session.period_id);
    const faculty = session.faculty_id ? facultyMap.get(session.faculty_id) : undefined;
    const teacherName = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'TBA';

    const docId = `${it.date}_${it.session_id}_${it.student_id}`;
    writes.push({
      docId,
      data: {
        student_id: it.student_id,
        session_id: it.session_id,
        date: it.date,
        status: it.status,
        marked_at: markedAt,
        marked_by: markedBy || null,
        first_name: student.first_name,
        last_name: student.last_name,
        last_initial: student.last_initial,
        preferred_name: student.preferred_name || null,
        instrument: student.instrument,
        ensemble: student.ensemble,
        session_name: session.name,
        period_number: period?.number ?? 0,
        period_name: period?.name ?? '',
        teacher_name: teacherName,
      },
    });
  });

  // Commit in chunks of 400.
  for (let offset = 0; offset < writes.length; offset += CHUNK_SIZE) {
    const chunk = writes.slice(offset, offset + CHUNK_SIZE);
    const batch = adminDb.batch();
    for (const w of chunk) {
      batch.set(attendanceCol().doc(w.docId), w.data);
    }
    await batch.commit();
    result.written += chunk.length;
  }

  return result;
}

export async function getAttendanceReport(date: string, status?: 'absent' | 'tardy'): Promise<AttendanceReport[]> {
  // Single where + client filter to avoid composite index requirement
  const snap = await attendanceCol().where('date', '==', date).get();

  const filteredDocs = status
    ? snap.docs.filter(doc => doc.data().status === status)
    : snap.docs.filter(doc => ['absent', 'tardy'].includes(doc.data().status));

  // Join parent contact + dorm info from students/{id} on the server side.
  // Admin client SDK can't read `students` (firestore.rules: if false), so this
  // join only works via the Admin SDK — PII never flows through the client.
  const results: AttendanceReport[] = [];
  for (const doc of filteredDocs) {
    const d = doc.data() as AttendanceDenormalized;
    const student = await getStudent(d.student_id);
    if (!student) continue;
    results.push({
      student_id: d.student_id,
      first_name: d.first_name,
      last_name: d.last_name,
      instrument: d.instrument,
      ensemble: d.ensemble,
      dorm_building: student.dorm_building ?? null,
      dorm_room: student.dorm_room ?? null,
      parent_phone: student.parent_phone ?? null,
      cell_phone: student.cell_phone ?? null,
      email: student.email ?? null,
      parent_first_name: student.parent_first_name ?? null,
      parent_last_name: student.parent_last_name ?? null,
      session_name: d.session_name,
      session_id: d.session_id,
      status: d.status as 'absent' | 'tardy',
      period_number: d.period_number,
      period_name: d.period_name,
      teacher_name: d.teacher_name,
      date: d.date,
    });
  }

  // Sort: period_number, then ensemble, then last_name, then first_name
  results.sort((a, b) => {
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    if (a.ensemble !== b.ensemble) return (a.ensemble || '').localeCompare(b.ensemble || '');
    if (a.last_name !== b.last_name) return a.last_name.localeCompare(b.last_name);
    return a.first_name.localeCompare(b.first_name);
  });

  return results;
}

// ─── Faculty Sessions (with attendance counts) ─────────────────────────

export async function getFacultySessions(facultyId: string, date?: string): Promise<FacultySessionRow[]> {
  const todayDate = date || getTodayDate();

  // Get all sessions for this faculty
  const sessSnap = await sessionsCol().where('faculty_id', '==', facultyId).get();
  if (sessSnap.empty) return [];

  // Load periods for ordering
  const periods = await getPeriods();
  const periodMap = new Map(periods.map(p => [p.id, p]));

  const results: FacultySessionRow[] = [];

  for (const sessDoc of sessSnap.docs) {
    const sess = { id: sessDoc.id, ...sessDoc.data() } as Session;
    const period = periodMap.get(sess.period_id);

    // Count enrolled students
    const enrolledSnap = await sessionStudentsCol()
      .where('session_id', '==', sess.id)
      .get();
    const totalStudents = enrolledSnap.size;

    // Count attendance for this session on this date
    const attSnap = await attendanceCol()
      .where('session_id', '==', sess.id)
      .get();

    let presentCount = 0, absentCount = 0, tardyCount = 0;
    for (const attDoc of attSnap.docs) {
      if (attDoc.data().date !== todayDate) continue;
      const st = attDoc.data().status;
      if (st === 'present') presentCount++;
      else if (st === 'absent') absentCount++;
      else if (st === 'tardy') tardyCount++;
    }

    results.push({
      id: sess.id,
      name: sess.name,
      type: sess.type,
      location: sess.location,
      period_number: period?.number ?? 0,
      start_time: period?.start_time ?? '',
      end_time: period?.end_time ?? '',
      period_name: period?.name ?? '',
      ensemble: sess.ensemble,
      instrument: sess.instrument,
      total_students: totalStudents,
      present_count: presentCount,
      absent_count: absentCount,
      tardy_count: tardyCount,
    });
  }

  results.sort((a, b) => a.period_number - b.period_number);
  return results;
}

// ─── Student Schedule ───────────────────────────────────────────────────

export async function getStudentSchedule(studentId: string, date?: string): Promise<StudentScheduleRow[]> {
  const todayDate = date || getTodayDate();

  // Find all session_students for this student
  const ssSnap = await sessionStudentsCol()
    .where('student_id', '==', studentId)
    .get();

  if (ssSnap.empty) return [];

  const sessionIds = ssSnap.docs.map(d => d.data().session_id as string);

  // Load sessions, periods, attendance
  const periods = await getPeriods();
  const periodMap = new Map(periods.map(p => [p.id, p]));

  const results: StudentScheduleRow[] = [];

  for (const sessionId of sessionIds) {
    const sess = await getSession(sessionId);
    if (!sess) continue;

    const period = periodMap.get(sess.period_id);

    // Get faculty name
    let teacherName = 'TBA';
    if (sess.faculty_id) {
      const fac = await getFacultyMember(sess.faculty_id);
      if (fac) teacherName = `${fac.first_name} ${fac.last_name}`;
    }

    // Get attendance
    const att = await getAttendance(studentId, sessionId, todayDate);

    results.push({
      session_id: sess.id,
      name: sess.name,
      type: sess.type,
      location: sess.location,
      period_number: period?.number ?? 0,
      start_time: period?.start_time ?? '',
      end_time: period?.end_time ?? '',
      period_name: period?.name ?? '',
      teacher_name: teacherName,
      attendance_status: att?.status ?? 'unmarked',
      date: att?.date ?? null,
    });
  }

  results.sort((a, b) => a.period_number - b.period_number);
  return results;
}

// ─── Student search (UX Task 11) ────────────────────────────────────────

export interface StudentSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  instrument: string;
  ensemble: string | null;
  dorm_building: string | null;
  dorm_room: string | null;
}

export interface StudentSearchResponse {
  results: StudentSearchResult[];
  total: number;
  truncated: boolean;
}

/**
 * Admin-only fuzzy search across the students collection.
 *
 * Firestore does not support substring indexes. For our ~644 students this
 * is small enough to fetch-and-filter in memory on each call. Expected
 * call volume is low (admin-only, manual searches from the dashboard).
 *
 * Matches case-insensitive substring against first_name, last_name,
 * preferred_name, instrument, and the "first last" concatenation.
 *
 * Ranking:
 *   1. Exact match on any searched field (first/last/preferred/instrument
 *      or "first last").
 *   2. Prefix match on any searched field.
 *   3. Substring match.
 * Ties are broken by last_name asc, then first_name asc.
 */
export async function searchStudents(
  query: string,
  limit: number
): Promise<StudentSearchResponse> {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], total: 0, truncated: false };

  const snap = await studentsCol().get();

  type Scored = { student: Student; rank: number };
  const scored: Scored[] = [];

  for (const doc of snap.docs) {
    const s = { id: doc.id, ...doc.data() } as Student;
    const first = (s.first_name || '').toLowerCase();
    const last = (s.last_name || '').toLowerCase();
    const preferred = (s.preferred_name || '').toLowerCase();
    const instrument = (s.instrument || '').toLowerCase();
    const fullName = `${first} ${last}`.trim();
    const fields = [first, last, preferred, instrument, fullName].filter(Boolean);

    let rank = 3; // 1 exact, 2 prefix, 3 substring, 4 no match
    let matched = false;
    for (const f of fields) {
      if (f === q) {
        rank = Math.min(rank, 1);
        matched = true;
      } else if (f.startsWith(q)) {
        rank = Math.min(rank, 2);
        matched = true;
      } else if (f.includes(q)) {
        rank = Math.min(rank, 3);
        matched = true;
      }
    }
    if (matched) scored.push({ student: s, rank });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const lastCmp = (a.student.last_name || '').localeCompare(b.student.last_name || '');
    if (lastCmp !== 0) return lastCmp;
    return (a.student.first_name || '').localeCompare(b.student.first_name || '');
  });

  const total = scored.length;
  const truncated = total > limit;
  const top = scored.slice(0, limit);

  const results: StudentSearchResult[] = top.map(({ student: s }) => ({
    id: s.id,
    first_name: s.first_name,
    last_name: s.last_name,
    preferred_name: s.preferred_name ?? null,
    instrument: s.instrument,
    ensemble: s.ensemble ?? null,
    dorm_building: s.dorm_building ?? null,
    dorm_room: s.dorm_room ?? null,
  }));

  return { results, total: results.length, truncated };
}

// ─── Student schedule for date (UX Task 11) ────────────────────────────

export interface StudentScheduleEntry {
  session_id: string;
  session_name: string;
  period_name: string;
  start_time: string;
  end_time: string;
  location: string | null;
  status: 'present' | 'absent' | 'tardy' | 'unmarked';
}

/**
 * Return the student's sessions for a given date, with attendance status
 * joined per session. Status is 'unmarked' when no attendance record exists.
 * Results ordered by period number ascending.
 */
export async function getStudentScheduleForDate(
  studentId: string,
  date: string
): Promise<StudentScheduleEntry[]> {
  const ssSnap = await sessionStudentsCol()
    .where('student_id', '==', studentId)
    .get();

  if (ssSnap.empty) return [];

  const sessionIds = ssSnap.docs.map(d => d.data().session_id as string);

  const periods = await getPeriods();
  const periodMap = new Map(periods.map(p => [p.id, p]));

  type Entry = StudentScheduleEntry & { _periodNumber: number };
  const entries: Entry[] = [];

  for (const sessionId of sessionIds) {
    const sess = await getSession(sessionId);
    if (!sess) continue;
    const period = periodMap.get(sess.period_id);
    const att = await getAttendance(studentId, sessionId, date);
    entries.push({
      session_id: sess.id,
      session_name: sess.name,
      period_name: period?.name ?? '',
      start_time: period?.start_time ?? '',
      end_time: period?.end_time ?? '',
      location: sess.location ?? null,
      status: att?.status ?? 'unmarked',
      _periodNumber: period?.number ?? 0,
    });
  }

  entries.sort((a, b) => a._periodNumber - b._periodNumber);
  return entries.map(({ _periodNumber, ...rest }) => rest);
}

// ─── Schedule grid (used by /api/schedule) ──────────────────────────────

export async function getScheduleGrid(): Promise<ScheduleGridRow[]> {
  const [periods, sessionsSnap, facultyList] = await Promise.all([
    getPeriods(),
    sessionsCol().get(),
    getFaculty(),
  ]);

  const facultyMap = new Map(facultyList.map(f => [f.id, f]));
  const periodMap = new Map(periods.map(p => [p.id, p]));

  // Count students per session
  const studentCountMap = new Map<string, number>();
  const ssSnap = await sessionStudentsCol().get();
  for (const doc of ssSnap.docs) {
    const sid = doc.data().session_id as string;
    studentCountMap.set(sid, (studentCountMap.get(sid) || 0) + 1);
  }

  const results: ScheduleGridRow[] = [];
  for (const sessDoc of sessionsSnap.docs) {
    const sess = sessDoc.data();
    const period = periodMap.get(sess.period_id);
    const faculty = sess.faculty_id ? facultyMap.get(sess.faculty_id) : undefined;

    results.push({
      id: sessDoc.id,
      name: sess.name,
      type: sess.type,
      location: sess.location,
      ensemble: sess.ensemble,
      instrument: sess.instrument,
      period_id: sess.period_id,
      faculty_id: sess.faculty_id,
      period_number: period?.number ?? 0,
      period_name: period?.name ?? '',
      start_time: period?.start_time ?? '',
      end_time: period?.end_time ?? '',
      faculty_name: faculty ? `${faculty.first_name} ${faculty.last_name}` : 'TBA',
      student_count: studentCountMap.get(sessDoc.id) || 0,
    });
  }

  results.sort((a, b) => {
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    return a.name.localeCompare(b.name);
  });

  return results;
}

// ─── Session with period info (used by /api/sessions/[id]) ──────────────

export async function getSessionWithPeriod(id: string): Promise<SessionWithPeriod | undefined> {
  const sess = await getSession(id);
  if (!sess) return undefined;

  const period = await getPeriod(sess.period_id);

  return {
    ...sess,
    period_number: period?.number ?? 0,
    period_name: period?.name ?? '',
    start_time: period?.start_time ?? '',
    end_time: period?.end_time ?? '',
  };
}

// ─── Students in a session (with full student data, for /api/sessions/[id]/students) ─

export async function getSessionStudentsFull(sessionId: string): Promise<Student[]> {
  const ssSnap = await sessionStudentsCol()
    .where('session_id', '==', sessionId)
    .get();

  if (ssSnap.empty) return [];

  const studentIds = ssSnap.docs.map(d => d.data().student_id as string);

  // Fetch all students (batch — Firestore doesn't have IN for >30 items easily)
  const students: Student[] = [];
  for (const sid of studentIds) {
    const s = await getStudent(sid);
    if (s) students.push(s);
  }

  students.sort((a, b) => {
    if (a.last_name !== b.last_name) return a.last_name.localeCompare(b.last_name);
    return a.first_name.localeCompare(b.first_name);
  });

  return students;
}

// ─── Daily stats ────────────────────────────────────────────────────────

export async function getDailyStats(date: string): Promise<DailyStats> {
  // Get all students
  const studentsSnap = await studentsCol().get();
  const totalStudents = studentsSnap.size;

  // Get all attendance for this date
  const attSnap = await attendanceCol().where('date', '==', date).get();

  const studentStatuses = new Map<string, Set<string>>();
  for (const doc of attSnap.docs) {
    const data = doc.data();
    if (!studentStatuses.has(data.student_id)) {
      studentStatuses.set(data.student_id, new Set());
    }
    studentStatuses.get(data.student_id)!.add(data.status);
  }

  let present = 0, absent = 0, tardy = 0, unmarked = 0;
  for (const sDoc of studentsSnap.docs) {
    const statuses = studentStatuses.get(sDoc.id);
    if (!statuses) {
      unmarked++;
    } else if (statuses.has('absent')) {
      absent++;
    } else if (statuses.has('tardy')) {
      tardy++;
    } else if (statuses.has('present')) {
      present++;
    } else {
      unmarked++;
    }
  }

  return { present, absent, tardy, unmarked, total: totalStudents };
}

// ─── Authorization helpers ─────────────────────────────────────────────

export async function isFacultyAssignedToSession(
  facultyId: string,
  sessionId: string
): Promise<boolean> {
  const doc = await sessionsCol().doc(sessionId).get();
  if (!doc.exists) return false;
  return doc.data()?.faculty_id === facultyId;
}

// ─── Camp Config ────────────────────────────────────────────────────────

const configCol = () => adminDb.collection('config');

/**
 * Merge a partial CampConfig into the active `config/camp` doc.
 *
 * Invalidates the server-side camp config cache so the next
 * `loadActiveCampServer` call re-reads from Firestore. Returns the full
 * resulting CampConfig after the merge.
 *
 * This helper does NOT validate the partial — validation is the caller's
 * responsibility (see `app/api/config/camp/route.ts` PUT handler).
 */
export async function setCampConfig(partial: Partial<CampConfig>): Promise<CampConfig> {
  const ref = configCol().doc('camp');
  // Use update() to merge without overwriting unspecified fields.
  await ref.update({ ...partial });
  invalidateCampConfigCache();
  const snap = await ref.get();
  return { ...(snap.data() as CampConfig) };
}

// Unambiguous charset — excludes 0/O/1/I/L to avoid human transcription errors.
const CAMP_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CAMP_CODE_LENGTH = 8;

function generateCampCode(): string {
  let out = '';
  for (let i = 0; i < CAMP_CODE_LENGTH; i++) {
    out += CAMP_CODE_CHARSET.charAt(randomInt(0, CAMP_CODE_CHARSET.length));
  }
  return out;
}

/**
 * Rotate the teacher camp code. Generates a crypto-random 8-char code
 * from an unambiguous uppercase alphanumeric charset (no 0/O/1/I/L),
 * writes it to `config/camp`, invalidates the cache, and returns the
 * new code.
 *
 * After rotation all existing teacher clients must re-enter the new
 * code — this invalidation is intentional.
 */
export async function rotateCampCode(): Promise<string> {
  const ref = configCol().doc('camp');
  const code = generateCampCode();
  await ref.update({ camp_code: code });
  invalidateCampConfigCache();
  return code;
}

/**
 * Set the teacher camp code to an explicit value. Unlike `rotateCampCode`
 * this does not generate the code — the caller supplies it. The helper
 * writes the value as-is (preserves case) so admins can choose a
 * memorable phrase like `ttuboc2026`. Validation of charset/length is
 * the caller's responsibility (see the POST route handler).
 *
 * Writes to `config/camp`, invalidates the cache, and returns the
 * provided code so the caller can echo it back in the response.
 */
export async function setCampCode(code: string): Promise<string> {
  const ref = configCol().doc('camp');
  await ref.update({ camp_code: code });
  invalidateCampConfigCache();
  return code;
}

// ─── Rollover ───────────────────────────────────────────────────────────
//
// Yearly rollover archives the previous camp's attendance + session
// enrollments under `camps/{oldId}/…`, clears the live collections, and
// advances `config/camp` to the new year with a fresh camp_code. Students,
// faculty, periods, and sessions are preserved year-over-year.
//
// There is NO separate `config/active_camp` pointer doc in this schema —
// `config/camp` IS the active config, and its `camp_id` / `camp_year`
// fields identify the current year.
//
// Safety model:
//   1. Archive is idempotent (same doc ids in the destination sub-collection).
//      Re-running after a partial archive failure just re-copies docs already
//      present — no duplicates.
//   2. Live collections are only cleared AFTER archive counts match live
//      counts. If a mismatch is detected, the operation aborts with an error
//      before touching the live data.
//   3. Each step logs progress so an ops person can see where a failure
//      occurred and whether retry is safe.

export interface PerformRolloverOptions {
  /** New camp year as a 4-digit string, e.g. "2027". Must be > old camp year. */
  newYear: string;
  /** ISO YYYY-MM-DD start of the new camp. */
  newStartDate: string;
  /** ISO YYYY-MM-DD end of the new camp. */
  newEndDate: string;
  /** IANA timezone for the new camp. */
  newTimezone: string;
  /**
   * When true (default), clears `ensemble` + `chair_number` on every student
   * doc so day-1 auditions start from a blank slate. When false, preserves
   * prior assignments (an admin can run a separate bulk-clear later).
   */
  clearEnsembleAssignments?: boolean;
  /** When true, returns counts but performs no writes. */
  dryRun?: boolean;
}

export interface PerformRolloverResult {
  dry_run: boolean;
  old_id: string;
  new_id: string;
  new_camp_code: string;
  archived: { attendance: number; session_students: number };
  cleared: { attendance: number; session_students: number };
}

const BATCH_CHUNK_SIZE = 400;

/**
 * Count documents in a collection (or sub-collection) via an empty-select
 * query. Uses `.count()` aggregation when available; falls back to a full
 * doc scan if the aggregate API isn't wired up in the current SDK version.
 */
export async function countDocs(collectionPath: string): Promise<number> {
  const col = adminDb.collection(collectionPath);
  // Prefer aggregate count — one round-trip, no doc payloads.
  const anyCol = col as unknown as { count?: () => { get: () => Promise<{ data: () => { count: number } }> } };
  if (typeof anyCol.count === 'function') {
    try {
      const agg = await anyCol.count!().get();
      return agg.data().count;
    } catch {
      // fall through to scan
    }
  }
  const snap = await col.select().get();
  return snap.size;
}

/**
 * Copy every doc from `fromPath` to `toPath`, preserving doc ids. Chunks
 * writes at BATCH_CHUNK_SIZE (400) to stay under Firestore's 500-op batch
 * limit. Idempotent — re-running against an already-populated destination
 * overwrites with the same values.
 *
 * Returns the number of docs copied.
 */
export async function copyCollectionDocs(fromPath: string, toPath: string): Promise<number> {
  const fromCol = adminDb.collection(fromPath);
  const toCol = adminDb.collection(toPath);
  const snap = await fromCol.get();
  if (snap.empty) return 0;

  const docs = snap.docs;
  for (let offset = 0; offset < docs.length; offset += BATCH_CHUNK_SIZE) {
    const chunk = docs.slice(offset, offset + BATCH_CHUNK_SIZE);
    const batch = adminDb.batch();
    for (const d of chunk) {
      batch.set(toCol.doc(d.id), d.data());
    }
    await batch.commit();
  }
  return docs.length;
}

/**
 * Delete every doc in a collection in chunked write-batches. Returns the
 * number of docs deleted. Used only after archive verification succeeds.
 */
export async function deleteAllDocs(collectionPath: string): Promise<number> {
  const col = adminDb.collection(collectionPath);
  const snap = await col.get();
  if (snap.empty) return 0;

  const docs = snap.docs;
  for (let offset = 0; offset < docs.length; offset += BATCH_CHUNK_SIZE) {
    const chunk = docs.slice(offset, offset + BATCH_CHUNK_SIZE);
    const batch = adminDb.batch();
    for (const d of chunk) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  return docs.length;
}

/**
 * Clear `ensemble` and `chair_number` on every student doc. Called during
 * rollover when `clearEnsembleAssignments` is true (default). Fresh day-1
 * auditions each camp.
 *
 * `ensemble` is typed as a required string on Student, so we clear to ''
 * (empty string) rather than deleting the field — the type shape stays
 * consistent and existing reads won't break.
 */
export async function clearStudentEnsembleAssignments(): Promise<number> {
  const snap = await studentsCol().get();
  if (snap.empty) return 0;
  const docs = snap.docs;
  for (let offset = 0; offset < docs.length; offset += BATCH_CHUNK_SIZE) {
    const chunk = docs.slice(offset, offset + BATCH_CHUNK_SIZE);
    const batch = adminDb.batch();
    for (const d of chunk) {
      batch.update(d.ref, {
        ensemble: '',
        chair_number: FieldValue.delete(),
      });
    }
    await batch.commit();
  }
  return docs.length;
}

/**
 * Execute a yearly rollover.
 *
 * Order of operations (dryRun=false):
 *   1. Load active config; record oldId = camp_id.
 *   2. Archive attendance/*       → camps/{oldId}/attendance/*       (chunked)
 *   3. Archive session_students/* → camps/{oldId}/session_students/* (chunked)
 *   4. Verify archive counts match live counts. Abort on mismatch.
 *   5. Delete live attendance/*       (chunked)
 *   6. Delete live session_students/* (chunked)
 *   7. (optional) Clear ensemble + chair_number on every student.
 *   8. Update config/camp: new camp_id, camp_year, dates, timezone,
 *      day_dates (derived), and a fresh crypto-random camp_code.
 *
 * dryRun=true performs only steps 1 + the read counts and returns the
 * expected archive/cleared totals without any writes.
 *
 * Failure modes:
 *   - Mid-archive failure (step 2 or 3): safe to retry. Archive writes
 *     use fixed doc ids so re-running completes without duplicates.
 *   - Count-verification failure (step 4): throws before any destructive
 *     write. No live data altered.
 *   - Mid-clear failure (step 5 or 6): live collection partially cleared
 *     but archive is intact. Re-running dryRun will report the remaining
 *     live count; a targeted clean-up is then safe because the archive
 *     already has every original doc.
 */
export async function performRollover(
  opts: PerformRolloverOptions
): Promise<PerformRolloverResult> {
  const {
    newYear,
    newStartDate,
    newEndDate,
    newTimezone,
    clearEnsembleAssignments = true,
    dryRun = false,
  } = opts;

  // Step 1 — load active config. Force-reload to bypass the 30s cache so
  // a second rollover attempt right after a config edit sees the latest
  // camp_id.
  const active = await loadActiveCampServer(true);
  const oldId = active.camp_id;
  const oldYear = active.camp_year;

  const newYearNum = Number.parseInt(newYear, 10);
  if (!Number.isFinite(newYearNum) || newYearNum <= oldYear) {
    throw new Error(
      `new_year (${newYear}) must be greater than current camp_year (${oldYear})`
    );
  }

  console.log(`[rollover] start old_id=${oldId} new_year=${newYear} dry_run=${dryRun}`);

  // Always measure live counts first — needed for dry-run output and
  // archive verification on real runs.
  const [liveAttendanceCount, liveSessionStudentsCount] = await Promise.all([
    countDocs('attendance'),
    countDocs('session_students'),
  ]);

  console.log(
    `[rollover] live counts attendance=${liveAttendanceCount} ` +
      `session_students=${liveSessionStudentsCount}`
  );

  if (dryRun) {
    return {
      dry_run: true,
      old_id: oldId,
      new_id: newYear,
      new_camp_code: '',
      archived: {
        attendance: liveAttendanceCount,
        session_students: liveSessionStudentsCount,
      },
      cleared: { attendance: 0, session_students: 0 },
    };
  }

  // Step 2 — archive attendance.
  console.log(`[rollover] archiving attendance → camps/${oldId}/attendance`);
  const archivedAttendance = await copyCollectionDocs(
    'attendance',
    `camps/${oldId}/attendance`
  );

  // Step 3 — archive session_students.
  console.log(`[rollover] archiving session_students → camps/${oldId}/session_students`);
  const archivedSessionStudents = await copyCollectionDocs(
    'session_students',
    `camps/${oldId}/session_students`
  );

  // Step 4 — verify archive counts match live counts BEFORE destructive clears.
  if (
    archivedAttendance !== liveAttendanceCount ||
    archivedSessionStudents !== liveSessionStudentsCount
  ) {
    const msg =
      `[rollover] archive count mismatch — ` +
      `live attendance=${liveAttendanceCount} archived=${archivedAttendance}, ` +
      `live session_students=${liveSessionStudentsCount} archived=${archivedSessionStudents}. ` +
      `Aborting before clearing live data.`;
    console.error(msg);
    throw new Error(msg);
  }
  console.log('[rollover] archive verified — counts match live');

  // Step 5 — clear live attendance.
  console.log('[rollover] clearing live attendance');
  const clearedAttendance = await deleteAllDocs('attendance');

  // Step 6 — clear live session_students.
  console.log('[rollover] clearing live session_students');
  const clearedSessionStudents = await deleteAllDocs('session_students');

  // Step 7 — optional: reset audition assignments on students.
  if (clearEnsembleAssignments) {
    console.log('[rollover] clearing ensemble + chair_number on students');
    const touched = await clearStudentEnsembleAssignments();
    console.log(`[rollover] cleared ensemble/chair on ${touched} students`);
  } else {
    console.log('[rollover] preserving ensemble assignments (flag off)');
  }

  // Step 8 — advance config/camp to the new year with fresh code.
  const newCode = generateCampCode();
  const dayDates = deriveDayDates(newStartDate, newEndDate) as Record<string, string>;
  const ref = configCol().doc('camp');
  await ref.update({
    camp_id: newYear,
    camp_year: newYearNum,
    start_date: newStartDate,
    end_date: newEndDate,
    timezone: newTimezone,
    day_dates: dayDates,
    camp_code: newCode,
  });
  invalidateCampConfigCache();
  console.log(`[rollover] done old_id=${oldId} new_id=${newYear} new_code_len=${newCode.length}`);

  return {
    dry_run: false,
    old_id: oldId,
    new_id: newYear,
    new_camp_code: newCode,
    archived: {
      attendance: archivedAttendance,
      session_students: archivedSessionStudents,
    },
    cleared: {
      attendance: clearedAttendance,
      session_students: clearedSessionStudents,
    },
  };
}

// ─── Admin Allowlist ────────────────────────────────────────────────────
//
// Admins are represented as docs in the `admins` collection, keyed by the
// lowercased email. The shape is `{ email, added_by, added_at }`.
//
// Bootstrap: when the collection is empty, `ADMIN_BOOTSTRAP_EMAILS`
// (comma-separated) acts as a recovery allowlist so the first admin can
// sign in and seed themselves. Once any admin exists, the env var is
// ignored — only admins/{email} grants access.
//
// Security rules (firestore.rules) default-deny all client access to this
// collection; every read/write goes through the Admin SDK here.

const adminsCol = () => adminDb.collection('admins');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bootstrapEmails(): string[] {
  const raw = process.env.ADMIN_BOOTSTRAP_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

async function adminsCollectionIsEmpty(): Promise<boolean> {
  // A `.limit(1).get()` keeps this cheap even as the collection grows.
  const col = adminsCol() as unknown as {
    limit?: (n: number) => { get: () => Promise<{ empty: boolean }> };
    get: () => Promise<{ empty: boolean }>;
  };
  if (typeof col.limit === 'function') {
    const snap = await col.limit(1).get();
    return snap.empty;
  }
  const snap = await col.get();
  return snap.empty;
}

/**
 * Return true iff the given email is allowed to act as admin.
 *
 * Checks `admins/{email}` first (case-insensitive). If the collection is
 * empty AND the email appears in `ADMIN_BOOTSTRAP_EMAILS`, returns true
 * WITHOUT writing — seeding happens in `bootstrapAdminIfEmpty`.
 */
export async function isAdminEmail(email: string): Promise<boolean> {
  if (!email) return false;
  const key = email.toLowerCase();
  const doc = await adminsCol().doc(key).get();
  if (doc.exists) return true;

  // Bootstrap path — only when the collection has no admins yet.
  const bootstraps = bootstrapEmails();
  if (bootstraps.length === 0) return false;
  if (!bootstraps.includes(key)) return false;
  return await adminsCollectionIsEmpty();
}

/**
 * Seed the first admin when the collection is empty and the caller's
 * email matches `ADMIN_BOOTSTRAP_EMAILS`. Returns true if a doc was
 * written; false otherwise. Safe to call multiple times — idempotent.
 *
 * Note: there's a small race if two bootstrap-eligible users hit this
 * simultaneously. Both may observe `empty` and both may write, landing
 * as two admins. Acceptable — they're all on the allowlist by policy.
 */
export async function bootstrapAdminIfEmpty(email: string): Promise<boolean> {
  if (!email) return false;
  const key = email.toLowerCase();
  const bootstraps = bootstrapEmails();
  if (!bootstraps.includes(key)) return false;
  if (!(await adminsCollectionIsEmpty())) return false;

  await adminsCol().doc(key).set({
    email: key,
    added_by: 'bootstrap',
    added_at: Date.now(),
  });
  return true;
}

/**
 * List every admin entry. Returns an array of `{ email, added_by, added_at }`.
 */
export async function listAdmins(): Promise<
  Array<{ email: string; added_by: string; added_at: number }>
> {
  const snap = await adminsCol().get();
  return snap.docs.map((doc) => {
    const d = doc.data() as { email?: string; added_by?: string; added_at?: number };
    return {
      email: d.email ?? doc.id,
      added_by: d.added_by ?? 'unknown',
      added_at: d.added_at ?? 0,
    };
  });
}

/**
 * Add a new admin. Lowercases + validates email. Throws if email is
 * malformed or if an admin with the same address already exists.
 */
export async function addAdmin(email: string, addedBy: string): Promise<void> {
  const key = (email || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(key)) {
    throw new Error('Invalid email');
  }
  const ref = adminsCol().doc(key);
  const existing = await ref.get();
  if (existing.exists) {
    throw new Error('Admin already exists');
  }
  await ref.set({
    email: key,
    added_by: addedBy,
    added_at: Date.now(),
  });
}

/**
 * Remove an admin. Idempotent — no-op if not present.
 */
export async function removeAdmin(email: string): Promise<void> {
  const key = (email || '').trim().toLowerCase();
  if (!key) return;
  await adminsCol().doc(key).delete();
}

// ─── Utility functions ──────────────────────────────────────────────────

export async function getCurrentPeriod(): Promise<number | null> {
  const currentTime = getCurrentTimeHHMM();
  const periods = await getPeriods();
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i]!;
    if (currentTime >= p.start_time && currentTime < p.end_time) {
      return p.number;
    }
  }
  return null;
}
