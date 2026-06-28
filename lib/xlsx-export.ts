import * as XLSX from 'xlsx';
import type { Student } from './types';
import { compareByScore } from './score-order';

/**
 * Build a roster .xlsx (name · instrument · grade) — the columns shown on the
 * ensemble attendance screen. Used by both the admin "all rosters" export (one
 * tab per ensemble) and the per-ensemble export on the open /e page. WRITE-only
 * (we never parse untrusted xlsx), so SheetJS's parser CVEs don't apply.
 */

export interface RosterRow {
  name: string;
  instrument: string;
  grade: string;
}

export interface RosterGroup {
  ensemble: string;
  rows: RosterRow[];
}

const HEADER = ['Name', 'Instrument', 'Grade'];

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ], unique, non-blank. */
function safeSheetName(raw: string, used: Set<string>): string {
  const base = (raw || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Map students → roster rows (name/instrument/grade), ordered by score. */
export function studentsToRosterRows(students: Student[]): RosterRow[] {
  return [...students]
    .sort(compareByScore)
    .map((s) => ({
      name: `${s.preferred_name || s.first_name || ''} ${s.last_name || ''}`.trim(),
      instrument: s.instrument || '',
      grade: s.grade || '',
    }));
}

/** A workbook with one sheet per ensemble (sorted), each Name/Instrument/Grade. */
export function rosterWorkbook(groups: RosterGroup[]): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const sorted = [...groups].sort((a, b) => a.ensemble.localeCompare(b.ensemble));
  if (sorted.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER]), 'Roster');
  }
  for (const g of sorted) {
    const aoa = [HEADER, ...g.rows.map((r) => [r.name, r.instrument, r.grade])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(g.ensemble, used));
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
