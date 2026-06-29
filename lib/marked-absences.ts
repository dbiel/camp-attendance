import { adminDb } from './firebase-admin';
import { getTodayDate } from './date';

export interface MarkedAbsence {
  id: string;
  student_id: string;
  student_name: string;
  date: string;          // 'YYYY-MM-DD' camp-tz
  from: string;          // 'HH:MM' inclusive
  until: string;         // 'HH:MM' exclusive
  note: string | null;
  status: 'active' | 'cleared';
  cleared_at: string | null;
  cleared_reason: 'arrived' | 'manual' | null;
  created_by: string;
  created_at: string;
}

const COLL = 'marked_absences';
const HHMM = /^\d{1,2}:\d{2}$/;

/** Pure: a valid HH:MM window with from strictly before until. */
export function validateWindow(from: string, until: string): boolean {
  return HHMM.test(from) && HHMM.test(until) && from < until;
}

/** Pure: does this absence cover `nowHHMM` on `date`? until is exclusive. */
export function isCovering(
  a: Pick<MarkedAbsence, 'status' | 'date' | 'from' | 'until'>,
  nowHHMM: string,
  date: string
): boolean {
  return a.status === 'active' && a.date === date && a.from <= nowHHMM && nowHHMM < a.until;
}

/** Pure: roster students whose absence covers now, keyed by student_id. */
export function filterCoveringForStudents(
  absences: MarkedAbsence[],
  studentIds: string[],
  nowHHMM: string,
  date: string
): Map<string, MarkedAbsence> {
  const ids = new Set(studentIds);
  const out = new Map<string, MarkedAbsence>();
  for (const a of absences) {
    if (ids.has(a.student_id) && isCovering(a, nowHHMM, date)) out.set(a.student_id, a);
  }
  return out;
}

export interface CreateMarkedAbsenceInput {
  student_id: string;
  student_name: string;
  from: string;
  until: string;
  note?: string | null;
  date?: string;
  created_by: string;
}

export async function createMarkedAbsence(input: CreateMarkedAbsenceInput): Promise<string> {
  if (!input.student_id) throw new Error('no_student');
  if (!validateWindow(input.from, input.until)) throw new Error('bad_window');
  const now = new Date().toISOString();
  const doc: Omit<MarkedAbsence, 'id'> = {
    student_id: input.student_id,
    student_name: input.student_name,
    date: input.date ?? getTodayDate(),
    from: input.from,
    until: input.until,
    note: input.note && input.note.trim() ? input.note.trim() : null,
    status: 'active',
    cleared_at: null,
    cleared_reason: null,
    created_by: input.created_by,
    created_at: now,
  };
  const ref = await adminDb.collection(COLL).add(doc);
  return ref.id;
}

/** Active absences for a camp-tz day, soonest-first. Two equality filters only
 * (no composite index). */
export async function listMarkedAbsences(date: string): Promise<MarkedAbsence[]> {
  const snap = await adminDb
    .collection(COLL)
    .where('date', '==', date)
    .where('status', '==', 'active')
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MarkedAbsence, 'id'>) }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Roster students with an active absence covering now (student_id → absence). */
export async function activeMarkedAbsencesForStudents(
  studentIds: string[],
  nowHHMM: string,
  date: string
): Promise<Map<string, MarkedAbsence>> {
  if (studentIds.length === 0) return new Map();
  const all = await listMarkedAbsences(date);
  return filterCoveringForStudents(all, studentIds, nowHHMM, date);
}

export async function clearMarkedAbsence(id: string, reason: 'arrived' | 'manual'): Promise<void> {
  await adminDb.collection(COLL).doc(id).update({
    status: 'cleared',
    cleared_at: new Date().toISOString(),
    cleared_reason: reason,
  });
}
