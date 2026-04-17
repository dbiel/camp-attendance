/**
 * Date helpers pinned to camp timezone (America/Chicago by default).
 * The camp runs in Lubbock, TX — do NOT use UTC for "today" calculations.
 */

const DEFAULT_CAMP_TZ = 'America/Chicago';

export type DayKey = 'M' | 'T' | 'W' | 'Th' | 'F' | 'S' | 'Su';
export type DayDates = Partial<Record<DayKey, string>>;

const DAY_LABELS: Record<DayKey, string> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  Th: 'Thu',
  F: 'Fri',
  S: 'Sat',
  Su: 'Sun',
};

// Maps JS getDay() (0=Sun .. 6=Sat) to our short camp-day keys. The
// codebase uses 'T' (not 'Tu') for Tuesday — preserved for backwards
// compatibility with seed data, teacher UI, and existing tests.
const DAY_KEY_BY_WEEKDAY: Record<number, DayKey> = {
  0: 'Su',
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'Th',
  5: 'F',
  6: 'S',
};

/** Today's ISO date (YYYY-MM-DD) in the given timezone. */
export function todayIsoInTimezone(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

/** Today's date in the default camp timezone (America/Chicago). */
export function getTodayDate(now: Date = new Date()): string {
  return todayIsoInTimezone(DEFAULT_CAMP_TZ, now);
}

/** Wall-clock HH:MM in the default camp timezone. */
export function getCurrentTimeHHMM(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_CAMP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(now);
}

/** Look up the ISO date for a day key ('M', 'T', ...). Returns null if unknown. */
export function dayKeyToDate(key: string, dayDates: DayDates): string | null {
  return (dayDates as Record<string, string>)[key] ?? null;
}

/** Reverse lookup: find the day key for an ISO date. Returns null if outside camp. */
export function dateToDayKey(date: string, dayDates: DayDates): DayKey | null {
  for (const [k, v] of Object.entries(dayDates)) {
    if (v === date) return k as DayKey;
  }
  return null;
}

/** Is this ISO date one of the camp days? */
export function isDateInCamp(date: string, dayDates: DayDates): boolean {
  return Object.values(dayDates).includes(date);
}

/** Short day label (Mon/Tue/...). Falls back to the key if unknown. */
export function formatDayLabel(key: string): string {
  return DAY_LABELS[key as DayKey] ?? key;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalIsoDate(iso: string): Date {
  if (!ISO_DATE_RE.test(iso)) {
    throw new RangeError(`invalid ISO date: ${iso}`);
  }
  // Parse as a local calendar date (not UTC) so getDay() returns the
  // weekday the user actually sees on their calendar regardless of the
  // host machine's timezone.
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const date = new Date(y!, (m ?? 1) - 1, d);
  // Guard against calendar rollovers like 2026-02-31 → March.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== (m ?? 1) - 1 ||
    date.getDate() !== d
  ) {
    throw new RangeError(`invalid ISO date: ${iso}`);
  }
  return date;
}

/**
 * Derive a day_dates map from a camp start/end date.
 *
 * Walks every day in the inclusive range [startDate, endDate] and maps
 * each date to its weekday key: Monday → 'M', Tuesday → 'T',
 * Wednesday → 'W', Thursday → 'Th', Friday → 'F', Saturday → 'S',
 * Sunday → 'Su'. (Note: the codebase uses 'T' for Tuesday — not 'Tu' —
 * to stay compatible with existing seed data and teacher UI.)
 *
 * If the camp spans more than 7 days, keys REPEAT across the walk and
 * **later occurrences win**. A 9-day camp starting on a Monday ends up
 * with the second Monday's date under 'M'. Day keys are short UI labels,
 * not unique identifiers — this matches how `day_dates` is consumed
 * everywhere else in the app.
 *
 * Throws a RangeError when either input isn't a valid `YYYY-MM-DD`
 * string or when `endDate < startDate`.
 */
export function deriveDayDates(startDate: string, endDate: string): DayDates {
  const start = parseLocalIsoDate(startDate);
  const end = parseLocalIsoDate(endDate);
  if (end.getTime() < start.getTime()) {
    throw new RangeError(`endDate (${endDate}) must be on or after startDate (${startDate})`);
  }

  const out: DayDates = {};
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = DAY_KEY_BY_WEEKDAY[cursor.getDay()]!;
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    out[key] = `${y}-${m}-${d}`;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
