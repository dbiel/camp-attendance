// `lookup_admin` replaces the legacy `dorm_admin` slot (general lookup, not
// dorm-scoped). Docs stored as `dorm_admin` are read back as `lookup_admin`
// for back-compat — see coerceAdminRole in lib/firestore.ts.
export type AdminRole = 'super_admin' | 'lookup_admin';

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
  grade?: string; // school grade/year — added with the 2026 roster; "—" until then
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
  // Attribution for the last edit (set server-side; never trusted from client).
  updated_by?: string;
  updated_at?: string;
  // Reversible "Remove from camp". When true the student is hidden from every
  // active roster, picker, attendance roll and the daily stats, but the record
  // (medical, contacts, history) is kept so they can be restored. Past incident
  // reports keep working since they cache the name. Attribution is server-set.
  withdrawn?: boolean;
  withdrawn_at?: string;
  withdrawn_by?: string;
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
  status: 'present' | 'absent';
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
  status: 'present' | 'absent';
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
  status: 'absent';
  period_number: number;
  period_name: string;
  teacher_name: string;
  date: string;
}

// Camp config stored in config/camp doc
export interface CampConfig {
  camp_id: string; // e.g. "2026"
  camp_code: string;
  camp_year: number;
  start_date: string; // ISO YYYY-MM-DD
  end_date: string; // ISO YYYY-MM-DD
  timezone: string; // IANA tz, e.g. "America/Chicago"
  day_dates: Record<string, string>; // { M: "2026-06-08", ... }
}

// Teacher-safe projection of CampConfig — no camp_code.
export type PublicCampConfig = Omit<CampConfig, 'camp_code'>;

// ─── iMessage ingest (`texts` collection) ──────────────────────────────
// Super-admin-only. Written by the Mac Mini watcher via the Admin SDK and
// read only through GET /api/texts. Idempotency key = message.guid (doc id).
// Firestore rejects `undefined`, so nullable fields use `| null`.
export type TextTag = 'camp' | 'personal' | 'unknown';

export interface TextDoc {
  id: string; // == message.guid (idempotency key)
  rowid: number; // chat.db delta cursor reference
  service: string; // 'iMessage' | 'SMS' | 'RCS' | … (whatever chat.db reports)
  sender_handle: string; // raw handle.id (phone E.164 or email)
  sender_contact_id: string | null;
  sender_name: string | null; // denormalized from the contact
  body: string;
  has_attachments: boolean;
  decode_failed: boolean;
  tag: TextTag;
  tag_reason: string;
  sent_at: string; // ISO, from message.date
  created_at: string; // ISO, ingest time
  escalated_case_id: string | null; // set by Plan C on escalation
  purge_after: string; // ISO; camp end + 30d (or sentAt + 90d fallback)
}

// ─── Firestore query return shapes ─────────────────────────────────────
// Row shapes for the cross-collection joins in lib/firestore.ts. These
// were previously `any` — typing them here gives callers IntelliSense
// and prevents accidental shape drift.

export interface FacultySessionRow {
  id: string;
  name: string;
  type: Session['type'];
  location?: string;
  period_number: number;
  start_time: string;
  end_time: string;
  period_name: string;
  ensemble?: string;
  instrument?: string;
  total_students: number;
  present_count: number;
  absent_count: number;
}

export interface StudentScheduleRow {
  session_id: string;
  name: string;
  type: Session['type'];
  location?: string;
  period_number: number;
  start_time: string;
  end_time: string;
  period_name: string;
  teacher_name: string;
  attendance_status: 'present' | 'absent' | 'unmarked';
  date: string | null;
}

export interface ScheduleGridRow {
  id: string;
  name: string;
  type: Session['type'];
  location?: string;
  ensemble?: string;
  instrument?: string;
  period_id: string;
  faculty_id?: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  faculty_name: string;
  student_count: number;
}

export interface SessionWithPeriod extends Session {
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
}

export interface DailyStats {
  present: number;
  absent: number;
  unmarked: number;
  total: number;
}

export interface CoverageRow {
  session_id: string;
  session_name: string;
  period_id: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  ensemble: string | null;
  instrument: string | null;
  faculty_id: string | null;
  teacher_name: string;
  total_students: number;
  marked_count: number;
  absent_count: number;
}
