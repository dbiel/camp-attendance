// @vitest-environment jsdom
/**
 * Import Parsers Unit Tests
 *
 * Covers the CSV (papaparse) + XLSX (xlsx) unified parseFile API,
 * the auto-detect-mapping heuristic, and the row normalization that
 * converts raw string rows into typed/validated records.
 *
 * Runs in jsdom because the parser accepts a browser-native `File`
 * and uses FileReader/ArrayBuffer under the hood.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseFile,
  autoDetectMapping,
  normalizeRows,
  type ColumnMapping,
  type NormalizedRow,
} from '@/lib/import-parsers';
import { STUDENT_SCHEMA, FACULTY_SCHEMA } from '@/lib/import-schemas';

function makeCsvFile(text: string, name = 'test.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

function makeXlsxFile(rows: unknown[][], name = 'test.xlsx'): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([ab], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('parseFile — CSV', () => {
  it('parses headers and rows', async () => {
    const csv = 'First Name,Last Name,Instrument\nAlice,Smith,Flute\nBob,Jones,Tuba\n';
    const parsed = await parseFile(makeCsvFile(csv));
    expect(parsed.headers).toEqual(['First Name', 'Last Name', 'Instrument']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ 'First Name': 'Alice', 'Last Name': 'Smith', Instrument: 'Flute' });
    expect(parsed.totalRows).toBe(2);
    expect(parsed.truncated).toBe(false);
    expect(parsed.filename).toBe('test.csv');
  });

  it('strips a UTF-8 BOM if present', async () => {
    const csv = '\uFEFFname,age\nAlice,30\n';
    const parsed = await parseFile(makeCsvFile(csv));
    expect(parsed.headers).toEqual(['name', 'age']);
  });

  it('skips empty lines', async () => {
    const csv = 'a,b\n1,2\n\n3,4\n';
    const parsed = await parseFile(makeCsvFile(csv));
    expect(parsed.rows).toHaveLength(2);
  });

  it('truncates past maxRows', async () => {
    const csv = 'a\n1\n2\n3\n4\n5\n';
    const parsed = await parseFile(makeCsvFile(csv), { maxRows: 3 });
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.truncated).toBe(true);
  });
});

describe('parseFile — XLSX', () => {
  it('parses a tiny workbook', async () => {
    const file = makeXlsxFile([
      ['First Name', 'Last Name', 'Instrument'],
      ['Alice', 'Smith', 'Flute'],
      ['Bob', 'Jones', 'Tuba'],
    ]);
    const parsed = await parseFile(file);
    expect(parsed.headers).toEqual(['First Name', 'Last Name', 'Instrument']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      'First Name': 'Alice',
      'Last Name': 'Smith',
      Instrument: 'Flute',
    });
  });

  it('coerces numeric cells to strings', async () => {
    const file = makeXlsxFile([
      ['name', 'age'],
      ['Alice', 30],
    ]);
    const parsed = await parseFile(file);
    expect(parsed.rows[0].age).toBe('30');
  });

  it('truncates past maxRows', async () => {
    const rows: unknown[][] = [['a']];
    for (let i = 0; i < 20; i++) rows.push([`v${i}`]);
    const parsed = await parseFile(makeXlsxFile(rows), { maxRows: 5 });
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.truncated).toBe(true);
  });
});

describe('parseFile — errors', () => {
  it('throws on unsupported extension', async () => {
    const file = new File(['garbage'], 'data.txt', { type: 'text/plain' });
    await expect(parseFile(file)).rejects.toThrow(/unsupported|extension/i);
  });

  it('throws on empty CSV', async () => {
    await expect(parseFile(makeCsvFile(''))).rejects.toThrow(/empty/i);
  });
});

describe('autoDetectMapping', () => {
  it('maps common student headers to canonical keys', () => {
    const headers = [
      'First Name',
      'Last Name',
      'Email Address',
      'Instrument',
      'Parent/Guardian First Name',
      'Cell Number',
    ];
    const mapping = autoDetectMapping(headers, STUDENT_SCHEMA);
    expect(mapping['First Name']).toBe('first_name');
    expect(mapping['Last Name']).toBe('last_name');
    expect(mapping['Email Address']).toBe('email');
    expect(mapping['Instrument']).toBe('instrument');
    expect(mapping['Parent/Guardian First Name']).toBe('parent_first_name');
    expect(mapping['Cell Number']).toBe('cell_phone');
  });

  it('is case-insensitive', () => {
    const mapping = autoDetectMapping(['FIRST NAME', 'last name'], STUDENT_SCHEMA);
    expect(mapping['FIRST NAME']).toBe('first_name');
    expect(mapping['last name']).toBe('last_name');
  });

  it('returns null for unknown headers', () => {
    const mapping = autoDetectMapping(['Mystery Column'], STUDENT_SCHEMA);
    expect(mapping['Mystery Column']).toBeNull();
  });

  it('works for faculty-style aliases (Fname/Lname/Assignment)', () => {
    const mapping = autoDetectMapping(['Fname', 'Lname', 'Assignment', 'Email'], FACULTY_SCHEMA);
    expect(mapping['Fname']).toBe('first_name');
    expect(mapping['Lname']).toBe('last_name');
    expect(mapping['Assignment']).toBe('role');
    expect(mapping['Email']).toBe('email');
  });
});

describe('normalizeRows', () => {
  it('returns all-valid rows with no errors when input is clean', () => {
    const rows = [
      {
        'First Name': 'Alice',
        'Last Name': 'Smith',
        Instrument: 'Flute',
        Email: 'alice@example.com',
      },
    ];
    const mapping: ColumnMapping = {
      'First Name': 'first_name',
      'Last Name': 'last_name',
      Instrument: 'instrument',
      Email: 'email',
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].data.first_name).toBe('Alice');
    expect(result.rows[0].data.email).toBe('alice@example.com');
  });

  it('flags missing required fields', () => {
    const rows = [{ 'First Name': 'Alice', 'Last Name': '', Instrument: 'Flute' }];
    const mapping: ColumnMapping = {
      'First Name': 'first_name',
      'Last Name': 'last_name',
      Instrument: 'instrument',
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors[0]).toEqual({
      field: 'last_name',
      message: expect.stringMatching(/required/i),
    });
  });

  it('flags invalid phone values', () => {
    const rows = [
      {
        'First Name': 'Alice',
        'Last Name': 'Smith',
        Instrument: 'Flute',
        Phone: 'not-a-phone',
      },
    ];
    const mapping: ColumnMapping = {
      'First Name': 'first_name',
      'Last Name': 'last_name',
      Instrument: 'instrument',
      Phone: 'cell_phone',
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors[0].field).toBe('cell_phone');
    expect(result.rows[0].errors[0].message).toMatch(/10 digits/i);
  });

  it('strips non-digits from phone and formats', () => {
    const rows = [
      {
        First: 'Alice',
        Last: 'Smith',
        Instrument: 'Flute',
        Phone: '555.123.4567',
      },
    ];
    const mapping: ColumnMapping = {
      First: 'first_name',
      Last: 'last_name',
      Instrument: 'instrument',
      Phone: 'cell_phone',
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].data.cell_phone).toBe('(555) 123-4567');
  });

  it('ignores unmapped columns', () => {
    const rows = [
      {
        First: 'Alice',
        Last: 'Smith',
        Instrument: 'Flute',
        Junk: 'whatever',
      },
    ];
    const mapping: ColumnMapping = {
      First: 'first_name',
      Last: 'last_name',
      Instrument: 'instrument',
      Junk: null,
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.rows[0].errors).toEqual([]);
    const data = result.rows[0].data as Record<string, unknown>;
    expect(data.junk).toBeUndefined();
    expect(data.first_name).toBe('Alice');
  });

  it('normalizes email (trim + lowercase)', () => {
    const rows = [
      {
        First: 'Alice',
        Last: 'Smith',
        Instrument: 'Flute',
        Email: '  ALICE@EXAMPLE.COM ',
      },
    ];
    const mapping: ColumnMapping = {
      First: 'first_name',
      Last: 'last_name',
      Instrument: 'instrument',
      Email: 'email',
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].data.email).toBe('alice@example.com');
  });

  it('exposes aggregate counts and per-row error arrays', () => {
    const rows = [
      { First: 'Alice', Last: 'Smith', Instrument: 'Flute' },
      { First: '', Last: 'Jones', Instrument: 'Tuba' },
    ];
    const mapping: ColumnMapping = {
      First: 'first_name',
      Last: 'last_name',
      Instrument: 'instrument',
    };
    const result = normalizeRows(rows, STUDENT_SCHEMA, mapping);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect((result.rows as NormalizedRow[]).length).toBe(2);
  });
});
