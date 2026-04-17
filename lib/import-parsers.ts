/**
 * Import Parsers — file-in, typed-rows-out for admin imports.
 *
 * Unified CSV (papaparse) + XLSX (SheetJS) `parseFile` API, plus
 * `autoDetectMapping` and `normalizeRows` helpers that together drive
 * the `/admin/import` wizard (Task 19).
 *
 * All three functions are framework-agnostic: they take plain data in,
 * return plain data out, and don't touch Firestore or auth.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { FieldDef, ImportSchema } from './import-schemas';

// ---------- parseFile ----------

export interface ParsedFile {
  /** Column headers from the first row (CSV header line / XLSX row 1). */
  headers: string[];
  /** Data rows as `{ header: value }` — every value is a string. */
  rows: Record<string, string>[];
  /** Original uploaded file name. */
  filename: string;
  /** Count of rows returned (post-truncation). */
  totalRows: number;
  /** True if we hit `maxRows` and stopped early. */
  truncated: boolean;
}

export interface ParseOptions {
  maxRows?: number;
}

const DEFAULT_MAX_ROWS = 10_000;

function getExtension(file: File): 'csv' | 'xlsx' | 'unknown' {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) return 'xlsx';
  // Fall back to mime type
  const type = (file.type || '').toLowerCase();
  if (type.includes('csv')) return 'csv';
  if (type.includes('spreadsheetml') || type.includes('excel')) return 'xlsx';
  return 'unknown';
}

async function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function parseCsv(file: File, maxRows: number): Promise<ParsedFile> {
  const raw = stripBOM(await readText(file));
  if (!raw.trim()) {
    throw new Error('File is empty');
  }
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    // Everything stays as strings — normalizeRows converts per-field.
    dynamicTyping: false,
  });
  if (result.errors && result.errors.length > 0) {
    // Papaparse reports structural errors (unclosed quotes, etc.) — surface
    // the first truly fatal one. FieldMismatch (missing trailing column) and
    // Delimiter auto-detection warnings (happens for single-column files)
    // are safe to ignore.
    const fatal = result.errors.find(
      (e) => e.type !== 'FieldMismatch' && e.code !== 'UndetectableDelimiter',
    );
    if (fatal) {
      throw new Error(`CSV parse error: ${fatal.message}`);
    }
  }
  const headers = (result.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
  const allRows = (result.data as Record<string, string>[]).filter(
    (r) => r && Object.values(r).some((v) => v != null && String(v).trim() !== ''),
  );
  const truncated = allRows.length > maxRows;
  const rows = truncated ? allRows.slice(0, maxRows) : allRows;
  return {
    headers,
    rows: rows.map((r) => coerceStringRecord(r)),
    filename: file.name,
    totalRows: rows.length,
    truncated,
  };
}

async function parseXlsx(file: File, maxRows: number): Promise<ParsedFile> {
  const buffer = await readArrayBuffer(file);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    throw new Error(
      `Failed to parse XLSX file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook has no sheets');
  }
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false, // use formatted strings for dates/numbers
    blankrows: false,
  });
  if (!aoa.length) {
    throw new Error('File is empty');
  }
  const rawHeaders = (aoa[0] as unknown[]).map((h) =>
    h == null ? '' : stripBOM(String(h)).trim(),
  );
  // Drop empty trailing header cells and track the column indexes we keep.
  const keptCols: number[] = [];
  const headers: string[] = [];
  rawHeaders.forEach((h, i) => {
    if (h) {
      keptCols.push(i);
      headers.push(h);
    }
  });

  const bodyRows = aoa.slice(1);
  const truncated = bodyRows.length > maxRows;
  const sliced = truncated ? bodyRows.slice(0, maxRows) : bodyRows;

  const rows: Record<string, string>[] = [];
  for (const r of sliced) {
    const rec: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const col = keptCols[idx];
      const cell = (r as unknown[])[col];
      const value = cell == null ? '' : String(cell);
      if (value !== '') hasValue = true;
      rec[header] = value;
    });
    if (hasValue) rows.push(rec);
  }

  return {
    headers,
    rows,
    filename: file.name,
    totalRows: rows.length,
    truncated,
  };
}

function coerceStringRecord(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

export async function parseFile(file: File, opts: ParseOptions = {}): Promise<ParsedFile> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const ext = getExtension(file);
  if (ext === 'csv') return parseCsv(file, maxRows);
  if (ext === 'xlsx') return parseXlsx(file, maxRows);
  throw new Error(
    `Unsupported file extension for "${file.name}". Expected .csv or .xlsx.`,
  );
}

// ---------- autoDetectMapping ----------

export interface ColumnMapping {
  /** Header from parsed file -> field key, or null to skip the column. */
  [header: string]: string | null;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim();
}

export function autoDetectMapping(headers: string[], schema: ImportSchema): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    let bestField: string | null = null;
    let bestScore = 0;

    for (const field of schema.fields) {
      const candidates = [
        field.key.toLowerCase().replace(/_/g, ' '),
        field.label.toLowerCase(),
        ...(field.aliases ?? []),
      ];
      for (const c of candidates) {
        if (!c) continue;
        // Score: longest substring match wins so that "parent first name"
        // beats "first name" when the header is "Parent/Guardian First Name".
        // Exact-equality gets a small bonus.
        let score = 0;
        if (normalized === c) score = c.length + 100;
        else if (normalized.includes(c)) score = c.length + 1;
        else if (c.includes(normalized) && normalized.length >= 3) score = normalized.length;
        if (score > bestScore) {
          bestScore = score;
          bestField = field.key;
        }
      }
    }
    mapping[header] = bestField;
  }
  return mapping;
}

// ---------- normalizeRows ----------

export interface RowError {
  field: string;
  message: string;
}

export interface NormalizedRow<T = Record<string, unknown>> {
  data: T;
  errors: RowError[];
}

export interface NormalizeResult<T = Record<string, unknown>> {
  rows: NormalizedRow<T>[];
  errorCount: number;
  validCount: number;
}

function findSourceHeader(mapping: ColumnMapping, fieldKey: string): string | null {
  for (const [header, key] of Object.entries(mapping)) {
    if (key === fieldKey) return header;
  }
  return null;
}

function isEmpty(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

export function normalizeRows<T = Record<string, unknown>>(
  rows: Record<string, string>[],
  schema: ImportSchema,
  mapping: ColumnMapping,
): NormalizeResult<T> {
  // Pre-compute header-per-field once.
  const fieldHeaderPairs: Array<{ field: FieldDef; header: string | null }> = schema.fields.map(
    (field) => ({ field, header: findSourceHeader(mapping, field.key) }),
  );

  const out: NormalizedRow<T>[] = [];
  let errorCount = 0;
  let validCount = 0;

  for (const row of rows) {
    const data: Record<string, unknown> = {};
    const errors: RowError[] = [];

    for (const { field, header } of fieldHeaderPairs) {
      const raw = header != null ? row[header] ?? '' : '';
      const trimmed = typeof raw === 'string' ? raw : String(raw);

      if (field.required && isEmpty(trimmed)) {
        errors.push({ field: field.key, message: `${field.label} is required` });
        continue;
      }

      if (isEmpty(trimmed)) {
        // Leave optional empty fields out of the record so downstream
        // Firestore writers can treat them as unset.
        continue;
      }

      if (field.validate) {
        const err = field.validate(trimmed);
        if (err) {
          errors.push({ field: field.key, message: err });
          continue;
        }
      }

      data[field.key] = field.transform ? field.transform(trimmed) : trimmed;
    }

    const normalized: NormalizedRow<T> = { data: data as T, errors };
    if (errors.length > 0) errorCount++;
    else validCount++;
    out.push(normalized);
  }

  return { rows: out, errorCount, validCount };
}
