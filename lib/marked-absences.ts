import { adminDb } from './firebase-admin';
import { getTodayDate } from './date';

export interface MarkedAbsence {
  id: string;
  student_id: string;
  student_name: string;
  date: string;          // 'YYYY-MM-DD' camp-tz — first day of the absence
  end_date?: string;     // 'YYYY-MM-DD' camp-tz — last day (omit/legacy → single day == date)
  from: string;          // 'HH:MM' inclusive (applies to each day in the range)
  until: string;         // 'HH:MM' exclusive
  all_day: boolean;      // true → whole-day; from/until are '00:00'/'23:59'
  note: string | null;
  status: 'active' | 'cleared';
  cleared_at: string | null;
  cleared_reason: 'arrived' | 'manual' | null;
  created_by: string;
  created_at: string;
}

const COLL = 'marked_absences';
const HHMM = /^\d{2}:\d{2}$/;

/** Pure: a valid HH:MM window with from strictly before until. */
export function validateWindow(from: string, until: string): boolean {
  return HHMM.test(from) && HHMM.test(until) && from < until;
}

/** Pure: a valid camp-tz YYYY-MM-DD that is today or later. */
export function validDate(date: string, today: string = getTodayDate()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today;
}

/** Pure: the stored window. All-day collapses to the whole camp day. */
export function resolveWindow(allDay: boolean, from: string, until: string): { from: string; until: string } {
  return allDay ? { from: '00:00', until: '23:59' } : { from, until };
}

/** Pure: an absence's last covered day (legacy single-day docs lack end_date). */
function endDateOf(a: { date: string; end_date?: string }): string {
  return a.end_date && a.end_date >= a.date ? a.end_date : a.date;
}

/** Pure: today + future active absences (range still running today or later),
 * sorted by start date then start time. */
export function filterUpcoming(absences: MarkedAbsence[], today: string): MarkedAbsence[] {
  return absences
    .filter((a) => endDateOf(a) >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
}

/** Pure: does this absence cover `nowHHMM` on `date`? The day must fall in the
 * [date, end_date] range (inclusive) and the clock window must contain now
 * (from inclusive, until exclusive). */
export function isCovering(
  a: Pick<MarkedAbsence, 'status' | 'date' | 'from' | 'until'> & { end_date?: string },
  nowHHMM: string,
  date: string
): boolean {
  return (
    a.status === 'active' &&
    a.date <= date &&
    date <= endDateOf(a) &&
    a.from <= nowHHMM &&
    nowHHMM < a.until
  );
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
  from?: string;
  until?: string;
  all_day?: boolean;
  note?: string | null;
  date?: string;
  end_date?: string;
  created_by: string;
}

export async function createMarkedAbsence(input: CreateMarkedAbsenceInput): Promise<string> {
  if (!input.student_id) throw new Error('no_student');
  const date = input.date ?? getTodayDate();
  if (!validDate(date)) throw new Error('bad_date');
  // end_date defaults to a single day; must be a valid camp-tz date no earlier
  // than the start. (validDate also enforces today-or-later, which start already
  // guarantees as the lower bound.)
  const endDate = input.end_date ?? date;
  if (!validDate(endDate) || endDate < date) throw new Error('bad_end_date');
  const allDay = input.all_day === true;
  if (!allDay && !validateWindow(input.from ?? '', input.until ?? '')) throw new Error('bad_window');
  const { from, until } = resolveWindow(allDay, input.from ?? '', input.until ?? '');
  const now = new Date().toISOString();
  const doc: Omit<MarkedAbsence, 'id'> = {
    student_id: input.student_id,
    student_name: input.student_name,
    date,
    end_date: endDate,
    from,
    until,
    all_day: allDay,
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

/** Active absences whose [date, end_date] range includes `date`, soonest-first.
 * Equality-only query (status) + in-code range filter, so multi-day absences
 * that started earlier are still found and no composite index is needed. */
export async function listMarkedAbsences(date: string): Promise<MarkedAbsence[]> {
  const snap = await adminDb
    .collection(COLL)
    .where('status', '==', 'active')
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MarkedAbsence, 'id'>) }))
    .filter((a) => a.date <= date && date <= endDateOf(a))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Today + future active absences (admin list). Equality-only query + in-code
 * date filter — no composite index. */
export async function listUpcomingMarkedAbsences(): Promise<MarkedAbsence[]> {
  const snap = await adminDb.collection(COLL).where('status', '==', 'active').get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MarkedAbsence, 'id'>) }));
  return filterUpcoming(all, getTodayDate());
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
