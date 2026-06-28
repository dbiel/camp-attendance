import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { rosterWorkbook, studentsToRosterRows } from '@/lib/xlsx-export';
import type { Student } from '@/lib/types';

const stu = (o: Partial<Student>): Student =>
  ({
    id: 'x',
    first_name: 'First',
    last_name: 'Last',
    last_initial: 'L',
    division: 'HS',
    instrument: 'Trumpet',
    ensemble: 'Band 1',
    created_at: '2026-06-01',
    ...o,
  }) as Student;

describe('studentsToRosterRows', () => {
  it('maps name/instrument/grade and orders by score (flute before trumpet)', () => {
    const rows = studentsToRosterRows([
      stu({ id: '1', first_name: 'A', last_name: 'Z', instrument: 'Trumpet', grade: '10' }),
      stu({ id: '2', first_name: 'B', last_name: 'Y', instrument: 'Flute', grade: '11' }),
    ]);
    expect(rows.map((r) => r.instrument)).toEqual(['Flute', 'Trumpet']);
    expect(rows[0]).toEqual({ name: 'B Y', instrument: 'Flute', grade: '11' });
  });

  it('prefers preferred_name and tolerates a missing grade', () => {
    const rows = studentsToRosterRows([
      stu({ first_name: 'Robert', preferred_name: 'Rob', last_name: 'X', instrument: 'Tuba' }),
    ]);
    expect(rows[0]!.name).toBe('Rob X');
    expect(rows[0]!.grade).toBe('');
  });
});

describe('rosterWorkbook', () => {
  it('makes one sheet per ensemble with a header row + data', () => {
    const buf = rosterWorkbook([
      { ensemble: 'Band 1', rows: [{ name: 'A B', instrument: 'Flute', grade: '10' }] },
      { ensemble: 'Orchestra 1', rows: [{ name: 'C D', instrument: 'Violin', grade: '9' }] },
    ]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Band 1', 'Orchestra 1']);
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['Band 1']!, { header: 1 });
    expect(aoa[0]).toEqual(['Name', 'Instrument', 'Grade']);
    expect(aoa[1]).toEqual(['A B', 'Flute', '10']);
  });

  it('sanitizes illegal sheet-name characters and dedupes collisions', () => {
    const buf = rosterWorkbook([
      { ensemble: 'A B C', rows: [] },
      { ensemble: 'A/B:C', rows: [] }, // sanitizes to the same name → must dedupe
    ]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames.length).toBe(2);
    expect(wb.SheetNames.every((n) => !/[:\\/?*[\]]/.test(n))).toBe(true);
  });

  it('still produces a valid workbook when there are no groups', () => {
    const wb = XLSX.read(rosterWorkbook([]), { type: 'buffer' });
    expect(wb.SheetNames.length).toBe(1);
  });
});
