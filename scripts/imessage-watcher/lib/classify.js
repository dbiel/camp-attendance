/**
 * JS mirror of lib/text-classify.ts for the watcher (Node, no TS build step).
 * Keyword/instrument signal lists are imported from the SAME shared JSON the
 * web app uses (lib/text-classify-data.json) so the two never drift.
 *
 * Keep this logic in lockstep with lib/text-classify.ts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'lib', 'text-classify-data.json'), 'utf8')
);

export const CAMP_KEYWORDS = data.keywords;
export const INSTRUMENT_TERMS = data.instruments;

const CAMP_CONTACT_ROLES = new Set(['faculty', 'dorm_staff', 'admin']);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findWordMatch(text, terms, minLen = 1) {
  for (const term of terms || []) {
    const t = String(term).trim();
    if (t.length < minLen) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(t)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text)) return t;
  }
  return null;
}

// Roster/dorm names below this length are too noisy to match safely.
const NAME_MIN_LEN = 3;

/**
 * @param {{body:string, senderContactRole?:string|null, rosterNames?:string[], dormNames?:string[]}} input
 * @returns {{tag:'camp'|'personal'|'unknown', reason:string}}
 */
export function classifyText(input) {
  const body = (input.body || '').trim();

  if (input.senderContactRole && CAMP_CONTACT_ROLES.has(input.senderContactRole)) {
    return { tag: 'camp', reason: `known camp contact (${input.senderContactRole})` };
  }

  if (!body) {
    return { tag: 'unknown', reason: 'empty body from unknown sender' };
  }

  const rosterHit = findWordMatch(body, input.rosterNames, NAME_MIN_LEN);
  if (rosterHit) return { tag: 'camp', reason: `roster name: ${rosterHit}` };

  const dormHit = findWordMatch(body, input.dormNames, NAME_MIN_LEN);
  if (dormHit) return { tag: 'camp', reason: `dorm building: ${dormHit}` };

  const instrumentHit = findWordMatch(body, INSTRUMENT_TERMS);
  if (instrumentHit) return { tag: 'camp', reason: `instrument: ${instrumentHit}` };

  const keywordHit = findWordMatch(body, CAMP_KEYWORDS);
  if (keywordHit) return { tag: 'camp', reason: `keyword: ${keywordHit}` };

  return { tag: 'personal', reason: 'no camp signal in message' };
}
