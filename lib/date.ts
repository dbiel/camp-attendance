/**
 * Date helpers pinned to camp timezone (America/Chicago).
 * The camp runs in Lubbock, TX — do NOT use UTC for "today" calculations.
 */

const CAMP_TZ = 'America/Chicago';

export function getTodayDate(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

export function getCurrentTimeHHMM(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(now);
}
