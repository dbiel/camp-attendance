/**
 * Client-only "new since I last looked" tracker for report badges.
 *
 * One localStorage map: caseId → the activity timestamp the user has already
 * seen. A report badges when its `last_activity_at` (new report OR a fresh
 * update) is newer than what's recorded. Opening the report's detail records
 * the current activity → clears the badge. Pure helpers (isUnseen/activityOf)
 * take the map so they're unit-testable without a browser.
 */

const KEY = 'camp_seen_cases_v1';

export type SeenMap = Record<string, string>;

/** Minimal shape we need off a Case to compute activity. */
export interface SeenCase {
  id: string;
  created_at: string;
  last_activity_at?: string;
}

/** The timestamp that represents "last activity" on a report. */
export function activityOf(c: SeenCase): string {
  return c.last_activity_at || c.created_at;
}

/**
 * PURE: has this report changed since the user last looked?
 * - Known id: unseen when its activity is newer than what was recorded.
 * - Unknown id (never recorded): `treatUnknownAsNew` decides — true once the
 *   store is initialized (a genuinely new report should badge), false on the
 *   very first run so we don't flood every existing report with a badge.
 */
export function isUnseen(
  c: SeenCase,
  map: SeenMap,
  opts: { treatUnknownAsNew?: boolean } = {}
): boolean {
  const seen = map[c.id];
  if (seen === undefined) return opts.treatUnknownAsNew ?? false;
  return activityOf(c) > seen;
}

export function readSeen(): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // private mode / quota — badges degrade gracefully (just won't persist)
  }
}

/** Record that the user has seen a report up to its current activity. */
export function markSeen(c: SeenCase): void {
  const map = readSeen();
  map[c.id] = activityOf(c);
  writeSeen(map);
}

/** Has the store been initialized at least once on this device? */
export function isInitialized(): boolean {
  if (typeof window === 'undefined') return true; // SSR: don't badge
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

/**
 * First-run seed: if nothing's stored yet, mark every currently-loaded report as
 * seen so the user doesn't open to a wall of badges. After this, only genuinely
 * new reports/updates badge. No-op once initialized.
 */
export function initSeenIfEmpty(cases: SeenCase[]): void {
  if (typeof window === 'undefined' || isInitialized()) return;
  const map: SeenMap = {};
  for (const c of cases) map[c.id] = activityOf(c);
  writeSeen(map);
}
