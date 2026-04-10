import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  Student, Faculty, Period, Session, SessionStudent,
  Attendance, AttendanceDenormalized, SessionStudentDenormalized,
  AttendanceReport,
} from './types';
import { getTodayDate, getCurrentTimeHHMM } from './date';

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
    // Denormalized student fields
    first_name: student.first_name,
    last_name: student.last_name,
    last_initial: student.last_initial,
    preferred_name: student.preferred_name || null,
    instrument: student.instrument,
    ensemble: student.ensemble,
    dorm_building: student.dorm_building || null,
    dorm_room: student.dorm_room || null,
    email: student.email || null,
    cell_phone: student.cell_phone || null,
    parent_first_name: student.parent_first_name || null,
    parent_last_name: student.parent_last_name || null,
    parent_phone: student.parent_phone || null,
    // Denormalized session/period fields
    session_name: session.name,
    period_number: period?.number ?? 0,
    period_name: period?.name ?? '',
    teacher_name: teacherName,
  });
}

export async function getAttendanceReport(date: string, status?: 'absent' | 'tardy'): Promise<AttendanceReport[]> {
  // Single where + client filter to avoid composite index requirement
  const snap = await attendanceCol().where('date', '==', date).get();

  const filteredDocs = status
    ? snap.docs.filter(doc => doc.data().status === status)
    : snap.docs.filter(doc => ['absent', 'tardy'].includes(doc.data().status));

  const results: AttendanceReport[] = filteredDocs.map(doc => {
    const d = doc.data() as AttendanceDenormalized;
    return {
      student_id: d.student_id,
      first_name: d.first_name,
      last_name: d.last_name,
      instrument: d.instrument,
      ensemble: d.ensemble,
      dorm_building: d.dorm_building,
      dorm_room: d.dorm_room,
      parent_phone: d.parent_phone,
      cell_phone: d.cell_phone,
      email: d.email,
      parent_first_name: d.parent_first_name,
      parent_last_name: d.parent_last_name,
      session_name: d.session_name,
      session_id: d.session_id,
      status: d.status as 'absent' | 'tardy',
      period_number: d.period_number,
      period_name: d.period_name,
      teacher_name: d.teacher_name,
      date: d.date,
    };
  });

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

export async function getFacultySessions(facultyId: string, date?: string): Promise<any[]> {
  const todayDate = date || getTodayDate();

  // Get all sessions for this faculty
  const sessSnap = await sessionsCol().where('faculty_id', '==', facultyId).get();
  if (sessSnap.empty) return [];

  // Load periods for ordering
  const periods = await getPeriods();
  const periodMap = new Map(periods.map(p => [p.id, p]));

  const results: any[] = [];

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

export async function getStudentSchedule(studentId: string, date?: string): Promise<any[]> {
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

  const results: any[] = [];

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

// ─── Schedule grid (used by /api/schedule) ──────────────────────────────

export async function getScheduleGrid(): Promise<any[]> {
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

  const results: any[] = [];
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

export async function getSessionWithPeriod(id: string): Promise<any | undefined> {
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

export async function getDailyStats(date: string): Promise<any> {
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
