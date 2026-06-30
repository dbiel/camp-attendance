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
 * SECURITY: this is the ONLY shape a tokenized viewer ever receives. It exposes
 * only what a counselor/dorm-staff member needs to identify and LOCATE the kid:
 * full FIRST name + LAST INITIAL only (David's call 2026-06-28 — minimize the
 * surname on a forwardable public link), instrument, and dorm building+room
 * (D1 — the locator). It must NEVER carry the full last name, medical notes,
 * parent contact, cell phone, raw report text, student id, reporter, schedule,
 * history, other students, or other Reports. Build it field-by-field
 * (allowlist), never spread the source docs. `updates` carries ONLY
 * `staff_update` events (the two-way thread); David's internal notes/texts stay
 * internal. Paired protections (live): 2h TTL, manual revoke, auto-die-on-
 * resolve, anti-leak headers, 128-bit token.
 */
export interface StaffLinkUpdate {
  body: string;
  actor: string;
  created_at: string;
}

export interface StaffLinkProjection {
  first_name: string; // full first name (preferred_name || first_name)
  last_initial: string; // last initial only (e.g. "A.") — NOT the full surname
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
  const lastName = student?.last_name ?? '';
  return {
    first_name: student?.preferred_name || student?.first_name || '',
    last_initial: lastName ? `${lastName.charAt(0)}.` : '',
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

/**
 * Scoped projection for the public ensemble incident layer (`/e/<token>` →
 * tap a flagged student). Awareness-only audience: like the staff link but
 * WITHOUT dorm/room (an ensemble leader needs to know what's going on, not to
 * locate the kid). Allowlist — never the full surname, dorm, medical, parent
 * contact, cell, raw text, student_id, reporter, schedule, or other students.
 * `timeline` carries the report + notes + office updates + resolution so the
 * director sees the full story; parent/dorm-contact events are excluded
 * (contact PII) and every author is collapsed to the reporting ensemble name or
 * a neutral "Camp office" (never an admin email).
 */
export type EnsembleTimelineKind = 'report' | 'note' | 'update' | 'resolved' | 'reopened';

export interface EnsembleTimelineEntry {
  kind: EnsembleTimelineKind;
  label: string;
  body: string;
  actor: string;
  created_at: string;
}

export interface EnsembleIncidentProjection {
  first_name: string;
  last_initial: string;
  instrument: string;
  report_summary: string;
  status: CaseStatus;
  resolution_note: string | null;
  timeline: EnsembleTimelineEntry[];
}

/** Map a raw event type to a director-facing timeline kind+label, or null to
 * exclude it (parent_texted / dorm_staff_texted carry contact PII). */
const TIMELINE_KINDS: Partial<Record<CaseEvent['type'], { kind: EnsembleTimelineKind; label: string }>> = {
  report_received: { kind: 'report', label: 'Reported' },
  note: { kind: 'note', label: 'Note' },
  staff_update: { kind: 'update', label: 'Update' },
  resolved: { kind: 'resolved', label: 'Resolved' },
  reopened: { kind: 'reopened', label: 'Reopened' },
};

/** Collapse an event author to a non-PII label: the reporting ensemble's name
 * (from an `ensemble:<name>` actor) or a neutral "Camp office" for anything
 * else (admin emails, contacts) — an admin email must NEVER reach this link. */
function ensembleActor(actor: string): string {
  if (actor && actor.startsWith('ensemble:')) return actor.slice('ensemble:'.length);
  return 'Camp office';
}

export function toEnsembleIncidentProjection(
  c: Case,
  student: Student | null,
  events: CaseEvent[]
): EnsembleIncidentProjection {
  const lastName = student?.last_name ?? '';
  return {
    first_name: student?.preferred_name || student?.first_name || '',
    last_initial: lastName ? `${lastName.charAt(0)}.` : '',
    instrument: student?.instrument ?? '',
    report_summary: c.summary,
    status: c.status,
    resolution_note: c.resolution_note ?? null,
    timeline: events.flatMap((e) => {
      const k = TIMELINE_KINDS[e.type];
      if (!k) return [];
      return [{ kind: k.kind, label: k.label, body: e.body, actor: ensembleActor(e.actor), created_at: e.created_at }];
    }),
  };
}
