import type { Faculty, SessionStudentDenormalized, Student } from './types';
import type { Case, CaseEvent, CaseStatus } from './cases';
import { scoreRank } from './score-order';

/**
 * Teacher-safe projections strip fields that expose PII or adult contact
 * info beyond what a teacher needs to take attendance. Apply these at the
 * API route boundary when the caller's role is 'teacher'.
 */

export type FacultyTeacherView = Pick<Faculty, 'id' | 'first_name' | 'last_name' | 'role'>;

export function facultyForTeacher(list: Faculty[]): FacultyTeacherView[] {
  return list.map(({ id, first_name, last_name, role }) => ({
    id,
    first_name,
    last_name,
    role,
  }));
}

export type SessionStudentTeacherView = Omit<SessionStudentDenormalized, 'dorm_room'>;

export function sessionStudentsForTeacher(
  list: SessionStudentDenormalized[]
): SessionStudentTeacherView[] {
  return list.map(({ dorm_room: _dorm_room, ...rest }) => rest);
}

/**
 * Scoped projection for the public two-way staff link (`/r/<token>`).
 *
 * SECURITY: this is the ONLY shape a tokenized viewer ever receives. It must
 * expose nothing beyond what a counselor/dorm-staff member needs to identify
 * and LOCATE the student: name (D2 full name — staff must find the right kid),
 * instrument, and dorm building+room (D1 — the locator). It must NEVER carry
 * medical notes, parent contact, cell phone, raw report text, student id,
 * reporter, schedule, history, other students, or other Reports. Build it
 * field-by-field (allowlist), never spread the source docs. `updates` carries
 * ONLY `staff_update` events (the two-way thread); David's internal notes/texts
 * stay internal. Paired protections (live): 2h TTL, manual revoke,
 * auto-die-on-resolve, anti-leak headers, 128-bit token.
 */
export interface StaffLinkUpdate {
  body: string;
  actor: string;
  created_at: string;
}

export interface StaffLinkProjection {
  first_name: string; // preferred_name || first_name
  last_name: string; // D2: full last name so staff find the RIGHT kid
  instrument: string;
  dorm_building: string; // D1: building code (e.g. "Wall") — the locator
  dorm_room: string;
  report_summary: string;
  status: CaseStatus;
  updates: StaffLinkUpdate[];
}

/**
 * Scoped roster row for the public ensemble-attendance page (`/e/<token>`).
 *
 * SECURITY: like the staff link, this is the ONLY shape the anonymous ensemble
 * page receives. It carries ONLY what's needed to take attendance — name,
 * instrument, grade — plus an OPAQUE `ref` (index into the server's id-sorted
 * roster, echoed back on submit) and `score_rank` (for client-side score-order
 * sorting). NO dorm, medical, parent contact, cell phone, division, or
 * student_id ever appears. Build field-by-field; pass an ALREADY id-sorted
 * roster so `ref` is stable between GET and submit.
 */
export interface EnsembleRosterRow {
  ref: number;
  first_name: string;
  last_name: string;
  instrument: string;
  grade: string;
  score_rank: number;
}

export function toEnsembleRosterProjection(idSortedRoster: Student[]): EnsembleRosterRow[] {
  return idSortedRoster.map((s, i) => ({
    ref: i,
    first_name: s.preferred_name || s.first_name || '',
    last_name: s.last_name || '',
    instrument: s.instrument || '',
    grade: s.grade || '',
    score_rank: scoreRank(s.instrument || ''),
  }));
}

export function toStaffLinkProjection(
  c: Case,
  student: Student | null,
  events: CaseEvent[]
): StaffLinkProjection {
  return {
    first_name: student?.preferred_name || student?.first_name || '',
    last_name: student?.last_name ?? '',
    instrument: student?.instrument ?? '',
    dorm_building: student?.dorm_building ?? '',
    dorm_room: student?.dorm_room ?? '',
    report_summary: c.summary,
    status: c.status,
    // Public viewer shows a NEUTRAL author — never reflect back the internal
    // recipient label David typed (it could name another link's recipient).
    // David still sees the real actor in the admin timeline (raw events).
    updates: events
      .filter((e) => e.type === 'staff_update')
      .map((e) => ({ body: e.body, actor: 'Camp staff', created_at: e.created_at })),
  };
}
