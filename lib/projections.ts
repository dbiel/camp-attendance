import type { Faculty, SessionStudentDenormalized } from './types';

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
