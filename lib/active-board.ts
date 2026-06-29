import { hourBucket, getTodayDate } from './date';
import type { Case } from './cases';

const stamp = (c: Case) => c.occurred_at || c.created_at;

/** The camp-tz hour-bucket key ("YYYY-MM-DD HH") for "now". With a ?now=HH:MM
 * test override, builds the key directly from the camp date + the override's
 * hour (NO naive Date parse — avoids a server-tz skew); otherwise buckets the
 * real current instant. */
export function currentHourKey(nowOverride: string | null, nowIso: string): string {
  if (nowOverride) {
    const hh = String(Number(nowOverride.split(':')[0])).padStart(2, '0');
    return `${getTodayDate()} ${hh}`;
  }
  return hourBucket(nowIso);
}

/** Split active cases into the current clock hour vs older still-active
 * ("carried over") ones, each newest-first. Display-only — never changes a
 * case's status, so a missing kid stays visible (just grouped + flagged). */
export function partitionActiveByHour(
  cases: Case[],
  nowHourKey: string
): { thisHour: Case[]; carriedOver: Case[] } {
  const newestFirst = (a: Case, b: Case) =>
    new Date(stamp(b)).getTime() - new Date(stamp(a)).getTime();
  const thisHour: Case[] = [];
  const carriedOver: Case[] = [];
  for (const c of cases) {
    if (hourBucket(stamp(c)) === nowHourKey) thisHour.push(c);
    else carriedOver.push(c);
  }
  thisHour.sort(newestFirst);
  carriedOver.sort(newestFirst);
  return { thisHour, carriedOver };
}
