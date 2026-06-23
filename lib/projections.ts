import type { Faculty, SessionStudentDenormalized, Student } from './types';
import type { Case, CaseEvent, CaseStatus } from './cases';

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
 * and locate the student — NO last name, medical notes, parent contact, cell
 * phone, raw report text, student id, reporter, other students, or other
 * Reports. Build it field-by-field (allowlist), never spread the source docs.
 * `updates` carries ONLY `staff_update` events (the two-way thread); David's
 * internal notes/texts stay internal.
 */
export interface StaffLinkUpdate {
  body: string;
  actor: string;
  created_at: string;
}

export interface StaffLinkProjection {
  first_name: string;
  last_initial: string;
  instrument: string;
  dorm_room: string;
  report_summary: string;
  status: CaseStatus;
  updates: StaffLinkUpdate[];
}

export function toStaffLinkProjection(
  c: Case,
  student: Student | null,
  events: CaseEvent[]
): StaffLinkProjection {
  const lastName = student?.last_name ?? '';
  return {
    first_name: student?.first_name ?? '',
    last_initial: lastName ? `${lastName.charAt(0)}.` : '',
    instrument: student?.instrument ?? '',
    dorm_room: student?.dorm_room ?? '',
    report_summary: c.summary,
    status: c.status,
    updates: events
      .filter((e) => e.type === 'staff_update')
      .map((e) => ({ body: e.body, actor: e.actor, created_at: e.created_at })),
  };
}
