export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  last_initial: string;
  preferred_name?: string;
  gender?: string;
  division: string;
  instrument: string;
  ensemble: string;
  chair_number?: number;
  dorm_building?: string;
  dorm_room?: string;
  email?: string;
  cell_phone?: string;
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  medical_notes?: string;
  additional_info?: string;
  created_at: string;
}

export interface Faculty {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email?: string;
  created_at: string;
}

export interface Period {
  id: string;
  number: number;
  name: string;
  start_time: string;
  end_time: string;
}

export interface Session {
  id: string;
  period_id: string;
  name: string;
  type: 'rehearsal' | 'sectional' | 'masterclass' | 'elective' | 'assembly' | 'lunch';
  location?: string;
  faculty_id?: string;
  ensemble?: string;
  instrument?: string;
}

export interface SessionStudent {
  id: string;
  session_id: string;
  student_id: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  session_id: string;
  date: string;
  status: 'present' | 'absent' | 'tardy';
  marked_at: string;
  marked_by?: string;
}

// Denormalized session_students doc for teacher queries (no PII)
export interface SessionStudentDenormalized {
  id: string;
  session_id: string;
  student_id: string;
  first_name: string;
  last_initial: string;
  preferred_name?: string;
  instrument: string;
  ensemble: string;
  dorm_room?: string;
}

// Denormalized attendance doc for admin dashboard queries.
//
// Parent contact info, email, cell phone, and dorm fields were previously
// denormalized here. They've been removed so a compromised admin client
// can't scrape parent PII by listening on the `attendance` collection.
// getAttendanceReport now joins those fields server-side from students/{id}.
//
// Optional fields use `string | null` (not `?:`) because Firestore rejects
// `undefined` values; the write path coerces missing values to `null`.
export interface AttendanceDenormalized {
  id: string;
  student_id: string;
  session_id: string;
  date: string;
  status: 'present' | 'absent' | 'tardy';
  marked_at: string;
  marked_by: string | null;
  // Display-only non-PII student fields
  first_name: string;
  last_name: string;
  last_initial: string;
  preferred_name: string | null;
  instrument: string;
  ensemble: string;
  // Denormalized session/period fields
  session_name: string;
  period_number: number;
  period_name: string;
  teacher_name: string;
}

export interface ScheduleTemplate {
  id: string;
  ensemble: string;
  instrument?: string;
  session_id: string;
}

export interface AttendanceReport {
  student_id: string;
  first_name: string;
  last_name: string;
  instrument: string;
  ensemble: string;
  dorm_building: string | null;
  dorm_room: string | null;
  parent_phone: string | null;
  cell_phone: string | null;
  email: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  session_name: string;
  session_id: string;
  status: 'absent' | 'tardy';
  period_number: number;
  period_name: string;
  teacher_name: string;
  date: string;
}

// Camp config stored in config/camp doc
export interface CampConfig {
  camp_code: string;
  camp_year: number;
  day_dates: Record<string, string>; // e.g. { "Monday": "2026-06-08", ... }
}
