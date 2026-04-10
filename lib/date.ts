/**
 * Date helpers pinned to camp timezone (America/Chicago by default).
 * The camp runs in Lubbock, TX — do NOT use UTC for "today" calculations.
 */

const DEFAULT_CAMP_TZ = 'America/Chicago';

export type DayKey = 'M' | 'T' | 'W' | 'Th' | 'F' | 'S';
export type DayDates = Partial<Record<DayKey, string>>;

const DAY_LABELS: Record<DayKey, string> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  Th: 'Thu',
  F: 'Fri',
  S: 'Sat',
};

// Ordered day keys for deriveDayDates.
const DAY_KEYS_ORDERED: DayKey[] = ['M', 'T', 'W', 'Th', 'F', 'S'];

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

/**
 * Derive a day_dates map from a camp start/end date.
 * Input: inclusive ISO dates (YYYY-MM-DD). Output: up to 6 day keys (M..S)
 * in order from startDate forward. Used by the Settings page to auto-fill
 * day_dates when the admin sets the camp date range.
 */
export function deriveDayDates(startDate: string, endDate: string): DayDates {
  const out: DayDates = {};
  // Parse as UTC noon to avoid timezone edge cases when incrementing.
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  if (start > end) return out;

  let i = 0;
  const cursor = new Date(start);
  while (cursor <= end && i < DAY_KEYS_ORDERED.length) {
    const key = DAY_KEYS_ORDERED[i]!;
    out[key] = cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    i += 1;
  }
  return out;
}
