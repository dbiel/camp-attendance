import type { Period } from './types';
import { toMinutes } from './schedule';

/**
 * Pure derivation for the admin "Attendance History" view. Turns raw
 * `ensemble_attendance` submissions + live `periods` + live rehearsal `sessions`
 * into a grid model (ensemble × past period) plus a chronological list. No I/O —
 * the API route feeds it Firestore data so this stays unit-testable.
 */

export interface AttendanceSubmission {
  ensemble: string;
  day_key: string;
  period_number: number;
  period_name: string;
  marks: Record<string, 'present' | 'absent'>;
  roster_size: number;
  submitted_at: string;
  /**
   * True for force-opened submissions, whose `period_number` is a clock hour
   * (8–17) that overlaps real period numbers (1–10). Forced submissions never
   * map to a grid cell — they only appear in the list.
   */
  forced?: boolean;
}

export interface RehearsalSlot {
  ensemble: string;
  period_number: number;
}

export type AttendanceCell =
  | { state: 'taken'; submitted_at: string; absent_count: number; roster_size: number }
  | { state: 'missed' }
  // A scheduled rehearsal in the period happening RIGHT NOW that hasn't been
  // taken yet — not (necessarily) missed, attendance can still come in.
  | { state: 'pending' }
  | { state: 'none' };

export interface AttendanceListItem {
  ensemble: string;
  period_number: number;
  period_name: string;
  submitted_at: string;
  absent_count: number;
  roster_size: number;
  scheduled: boolean;
  in_grid: boolean;
  forced: boolean;
}

export interface AttendancePeriod {
  number: number;
  name: string;
  start_time: string;
  end_time: string;
  /** True for the period in progress right now (today, start ≤ now < end). */
  in_progress: boolean;
}

export interface AttendanceHistory {
  day: string;
  periods: AttendancePeriod[];
  ensembles: string[];
  cells: Record<string, Record<number, AttendanceCell>>;
  list: AttendanceListItem[];
  availableDays: string[];
}

export interface BuildArgs {
  day: string;
  today: string;
  nowHHMM: string;
  periods: Period[];
  rehearsalSessions: RehearsalSlot[];
  submissions: AttendanceSubmission[];
  allDayKeys: string[];
  ensembles: readonly string[];
}

function absentCount(marks: Record<string, 'present' | 'absent'>): number {
  return Object.values(marks ?? {}).filter((m) => m === 'absent').length;
}

/** A period is "past" if its day is before today, or it's today and now is at/after its end. */
function isPast(p: Period, day: string, today: string, nowHHMM: string): boolean {
  if (day < today) return true;
  if (day > today) return false;
  // Numeric compare (not lexicographic) so unpadded times like '9:30' work too.
  const now = toMinutes(nowHHMM);
  const end = toMinutes(p.end_time);
  if (Number.isNaN(now) || Number.isNaN(end)) return false;
  return now >= end;
}

/** A period is "in progress" only on today's grid when now is within [start, end). */
function isInProgress(p: Period, day: string, today: string, nowHHMM: string): boolean {
  if (day !== today) return false;
  const now = toMinutes(nowHHMM);
  const start = toMinutes(p.start_time);
  const end = toMinutes(p.end_time);
  if (Number.isNaN(now) || Number.isNaN(start) || Number.isNaN(end)) return false;
  return now >= start && now < end;
}

export function buildAttendanceHistory(args: BuildArgs): AttendanceHistory {
  const { day, today, nowHHMM, periods, rehearsalSessions, submissions, allDayKeys, ensembles } = args;

  const daySubs = submissions.filter((s) => s.day_key === day);

  // Show every period that's already past PLUS the one in progress right now, so
  // the office can see whether attendance has been taken during the current
  // period instead of waiting for the hour to end.
  const shownPeriods: AttendancePeriod[] = periods
    .filter((p) => isPast(p, day, today, nowHHMM) || isInProgress(p, day, today, nowHHMM))
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      number: p.number,
      name: p.name,
      start_time: p.start_time,
      end_time: p.end_time,
      in_progress: isInProgress(p, day, today, nowHHMM),
    }));
  const shownNums = new Set(shownPeriods.map((p) => p.number));

  const scheduled = new Map<string, Set<number>>();
  for (const r of rehearsalSessions) {
    if (!scheduled.has(r.ensemble)) scheduled.set(r.ensemble, new Set());
    scheduled.get(r.ensemble)!.add(r.period_number);
  }

  // Only scheduled-period (non-forced) submissions map to grid cells. Forced
  // submissions carry a clock-hour period_number that overlaps real periods, so
  // keying them here would clobber a genuine submission / mislabel a column.
  const subByKey = new Map<string, AttendanceSubmission>();
  for (const s of daySubs) if (!s.forced) subByKey.set(`${s.ensemble}__${s.period_number}`, s);

  const cells: Record<string, Record<number, AttendanceCell>> = {};
  for (const ens of ensembles) {
    cells[ens] = {};
    for (const p of shownPeriods) {
      const sub = subByKey.get(`${ens}__${p.number}`);
      if (sub) {
        cells[ens][p.number] = {
          state: 'taken',
          submitted_at: sub.submitted_at,
          absent_count: absentCount(sub.marks),
          roster_size: sub.roster_size,
        };
      } else if (scheduled.get(ens)?.has(p.number)) {
        // A scheduled rehearsal with no submission: "pending" while the period is
        // still in progress (attendance can still arrive), "missed" once it ends.
        cells[ens][p.number] = { state: p.in_progress ? 'pending' : 'missed' };
      } else {
        cells[ens][p.number] = { state: 'none' };
      }
    }
  }

  const ensSet = new Set(ensembles);
  const list: AttendanceListItem[] = daySubs
    .slice()
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0))
    .map((s) => ({
      ensemble: s.ensemble,
      period_number: s.period_number,
      period_name: s.period_name,
      submitted_at: s.submitted_at,
      absent_count: absentCount(s.marks),
      roster_size: s.roster_size,
      scheduled: !s.forced && (scheduled.get(s.ensemble)?.has(s.period_number) ?? false),
      in_grid: !s.forced && ensSet.has(s.ensemble) && shownNums.has(s.period_number),
      forced: !!s.forced,
    }));

  const availableDays = [...new Set([...allDayKeys, today])].sort().reverse();

  return { day, periods: shownPeriods, ensembles: [...ensembles], cells, list, availableDays };
}
