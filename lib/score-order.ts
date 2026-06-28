/**
 * Score order = the standard order instruments appear top-to-bottom in a concert
 * band / orchestral score (woodwinds → brass → percussion → strings → keys).
 * Ensemble managers read rosters in this order. David can supply the camp's exact
 * canonical ordering later; this is the conventional one and is the toggle's
 * default (the other toggle is plain last-name A→Z).
 *
 * Matching is keyword-based against a normalized instrument string so "Bb
 * Clarinet", "B-flat Clarinet", and "Clarinet" all land on the clarinet rank.
 * More specific entries (piccolo, bass clarinet, bari sax) are listed BEFORE
 * their generic family so the first substring hit wins.
 */

interface ScoreEntry {
  rank: number;
  keywords: string[];
}

// Ordered most-specific-first WITHIN each family so the scan picks the tightest
// match (e.g. "bass clarinet" before "clarinet", "piccolo" before "flute").
const SCORE_TABLE: ScoreEntry[] = [
  { rank: 10, keywords: ['piccolo'] },
  { rank: 11, keywords: ['flute'] },
  { rank: 12, keywords: ['oboe'] },
  { rank: 13, keywords: ['english horn', 'cor anglais'] },
  { rank: 15, keywords: ['contrabassoon', 'contra bassoon'] },
  { rank: 14, keywords: ['bassoon'] },
  { rank: 16, keywords: ['eb clarinet', 'e-flat clarinet', 'e flat clarinet'] },
  { rank: 20, keywords: ['contrabass clarinet', 'contra clarinet', 'contra-alto clarinet'] },
  { rank: 19, keywords: ['bass clarinet'] },
  { rank: 18, keywords: ['alto clarinet'] },
  { rank: 17, keywords: ['clarinet'] },
  { rank: 24, keywords: ['soprano sax'] },
  { rank: 25, keywords: ['alto sax'] },
  { rank: 26, keywords: ['tenor sax'] },
  { rank: 27, keywords: ['baritone sax', 'bari sax', 'bari. sax'] },
  { rank: 28, keywords: ['saxophone', 'sax'] },
  { rank: 30, keywords: ['cornet'] },
  { rank: 31, keywords: ['trumpet'] },
  { rank: 32, keywords: ['flugelhorn', 'flugel'] },
  { rank: 33, keywords: ['french horn', 'mellophone', 'horn in f'] },
  { rank: 34, keywords: ['horn'] },
  { rank: 36, keywords: ['bass trombone'] },
  { rank: 37, keywords: ['trombone'] },
  { rank: 38, keywords: ['euphonium', 'baritone horn', 'baritone'] },
  { rank: 39, keywords: ['sousaphone', 'tuba'] },
  { rank: 42, keywords: ['timpani', 'timpany'] },
  { rank: 43, keywords: ['mallet', 'xylophone', 'marimba', 'vibraphone', 'glockenspiel', 'bells'] },
  { rank: 44, keywords: ['percussion', 'snare', 'cymbal', 'drum', 'battery', 'aux'] },
  { rank: 46, keywords: ['harp'] },
  { rank: 47, keywords: ['piano', 'keyboard', 'celesta'] },
  // Strings sit at the bottom of an orchestral score.
  { rank: 50, keywords: ['violin'] },
  { rank: 51, keywords: ['viola'] },
  { rank: 52, keywords: ['cello', 'violoncello'] },
  { rank: 53, keywords: ['double bass', 'string bass', 'contrabass', 'upright bass'] },
];

const UNKNOWN_RANK = 900; // unknown instruments sort after known ones, before A→Z fallback

function normalize(instrument: string): string {
  return (instrument || '').toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Score-order rank for an instrument string (lower = earlier in the score). */
export function scoreRank(instrument: string): number {
  const n = normalize(instrument);
  if (!n) return UNKNOWN_RANK;
  for (const entry of SCORE_TABLE) {
    if (entry.keywords.some((k) => n.includes(k))) return entry.rank;
  }
  return UNKNOWN_RANK;
}

export interface RosterSortable {
  instrument: string;
  last_name: string;
  first_name: string;
  chair_number?: number | null;
}

/** Comparator: score order, then chair number, then last/first name. */
export function compareByScore(a: RosterSortable, b: RosterSortable): number {
  const ra = scoreRank(a.instrument);
  const rb = scoreRank(b.instrument);
  if (ra !== rb) return ra - rb;
  const ca = a.chair_number ?? Number.MAX_SAFE_INTEGER;
  const cb = b.chair_number ?? Number.MAX_SAFE_INTEGER;
  if (ca !== cb) return ca - cb;
  return compareByLastName(a, b);
}

/** Comparator: last name A→Z, then first name. */
export function compareByLastName(a: RosterSortable, b: RosterSortable): number {
  const ln = (a.last_name || '').localeCompare(b.last_name || '');
  if (ln !== 0) return ln;
  return (a.first_name || '').localeCompare(b.first_name || '');
}
