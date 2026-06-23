/**
 * Deterministic camp-vs-personal text classifier.
 *
 * Cheap, no per-message LLM call. Shared by the web app (re-tagging via the
 * API) and the Mac Mini watcher (initial tag at ingest). Keyword/instrument
 * signal lists live in `text-classify-data.json` so both sides stay DRY.
 *
 * Rules (in order):
 *   1. Sender is a known contact with role faculty / dorm_staff / admin → camp.
 *   2. Body contains a roster student name, dorm building name, instrument
 *      term, or a camp keyword → camp (the reason names the hit).
 *   3. Body present but no signal → personal.
 *   4. Empty/whitespace body from an unknown sender → unknown (shown in the
 *      camp/triage view, since a missed real report is worse than a stray text).
 */
import data from './text-classify-data.json';

export type TextTag = 'camp' | 'personal' | 'unknown';

export type SenderContactRole = 'faculty' | 'dorm_staff' | 'admin' | 'other';

export interface ClassifyInput {
  body: string;
  /** Resolved role of the matched contact, if the sender is known. */
  senderContactRole?: SenderContactRole | null;
  /** Live roster first/last/preferred names to match against. */
  rosterNames?: string[];
  /** Live dorm building names to match against. */
  dormNames?: string[];
}

export interface ClassifyResult {
  tag: TextTag;
  reason: string;
}

export const CAMP_KEYWORDS: string[] = data.keywords;
export const INSTRUMENT_TERMS: string[] = data.instruments;

const CAMP_CONTACT_ROLES: ReadonlySet<string> = new Set(['faculty', 'dorm_staff', 'admin']);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the first term from `terms` that appears in `text` as a whole word
 * (case-insensitive). Returns the matched term, or null. Terms shorter than
 * `minLen` are skipped — roster data contains single-letter preferred names
 * and 2-char initials that would otherwise match common words and flood the
 * camp queue with false positives.
 */
function findWordMatch(text: string, terms: string[], minLen = 1): string | null {
  for (const term of terms) {
    const t = term.trim();
    if (t.length < minLen) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(t)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text)) return t;
  }
  return null;
}

// Roster/dorm names below this length are too noisy to match safely.
const NAME_MIN_LEN = 3;

export function classifyText(input: ClassifyInput): ClassifyResult {
  const body = (input.body ?? '').trim();

  // 1. Known camp contact wins outright (even with an empty body).
  if (input.senderContactRole && CAMP_CONTACT_ROLES.has(input.senderContactRole)) {
    return { tag: 'camp', reason: `known camp contact (${input.senderContactRole})` };
  }

  // 4. No body to inspect and sender unknown → unknown (triage).
  if (!body) {
    return { tag: 'unknown', reason: 'empty body from unknown sender' };
  }

  // 2. Body signals, in priority order: roster name, dorm, instrument, keyword.
  const rosterHit = findWordMatch(body, input.rosterNames ?? [], NAME_MIN_LEN);
  if (rosterHit) return { tag: 'camp', reason: `roster name: ${rosterHit}` };

  const dormHit = findWordMatch(body, input.dormNames ?? [], NAME_MIN_LEN);
  if (dormHit) return { tag: 'camp', reason: `dorm building: ${dormHit}` };

  const instrumentHit = findWordMatch(body, INSTRUMENT_TERMS);
  if (instrumentHit) return { tag: 'camp', reason: `instrument: ${instrumentHit}` };

  const keywordHit = findWordMatch(body, CAMP_KEYWORDS);
  if (keywordHit) return { tag: 'camp', reason: `keyword: ${keywordHit}` };

  // 3. Body but no signal.
  return { tag: 'personal', reason: 'no camp signal in message' };
}
