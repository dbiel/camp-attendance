/**
 * localStorage persistence for column mappings + payload adapters for the
 * /api/import/{entity} routes.
 *
 * Mapping key shape: `import.mapping.{entity}.{headers-hash}` — so a re-upload
 * of the same file shape (same sorted header list) will pre-fill the last
 * successful mapping. Hash is a tiny djb2-style digest over sorted headers so
 * we do not depend on Web Crypto in the browser.
 */
import type { EntityName } from '@/lib/import-schemas';
import type { ColumnMapping } from '@/lib/import-parsers';

const STORAGE_PREFIX = 'import.mapping';

function hashHeaders(headers: string[]): string {
  const joined = [...headers].map((h) => h.trim()).sort().join('|');
  // djb2; deterministic, ASCII-safe, short.
  let h = 5381;
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  // Unsigned hex
  return (h >>> 0).toString(16);
}

export function mappingStorageKey(entity: EntityName, headers: string[]): string {
  return `${STORAGE_PREFIX}.${entity}.${hashHeaders(headers)}`;
}

export function loadSavedMapping(
  entity: EntityName,
  headers: string[],
): ColumnMapping | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(mappingStorageKey(entity, headers));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ColumnMapping;
    // Verify every header is still in the saved mapping.
    const savedHeaders = Object.keys(parsed);
    if (savedHeaders.length !== headers.length) return null;
    for (const h of headers) {
      if (!(h in parsed)) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveMapping(
  entity: EntityName,
  headers: string[],
  mapping: ColumnMapping,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      mappingStorageKey(entity, headers),
      JSON.stringify(mapping),
    );
  } catch {
    // Ignore quota errors — remembering the mapping is a nice-to-have.
  }
}

/**
 * Adapt a normalized row from `normalizeRows` into the shape expected by
 * the matching /api/import/{entity} route.
 *
 * - students / faculty: fields line up 1:1, pass through as-is.
 * - sessions: schema stores `period_name` (free-text Period label) but the
 *   API expects `period_number` (parsed by parseInt). We pass the mapped
 *   value through under that key so numeric labels "1", "2" work; non-numeric
 *   labels surface the API's existing "Invalid period number" error.
 * - enrollments: schema stores student/session by name, but the API resolves
 *   by id. We forward `student_name` as `student_id` and `session_name` as
 *   `session_id` so admins who exported id columns still work. Name-based
 *   enrollments will fail server-side and end up in the error CSV.
 */
export function adaptRowForApi(
  entity: EntityName,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (entity === 'sessions') {
    const out: Record<string, unknown> = { ...data };
    if ('period_name' in out && !('period_number' in out)) {
      out.period_number = out.period_name;
      delete out.period_name;
    }
    return out;
  }
  if (entity === 'enrollments') {
    const out: Record<string, unknown> = { ...data };
    if ('student_name' in out && !('student_id' in out)) {
      out.student_id = out.student_name;
      delete out.student_name;
    }
    if ('session_name' in out && !('session_id' in out)) {
      out.session_id = out.session_name;
      delete out.session_name;
    }
    return out;
  }
  return data;
}

export function buildImportPayload(
  entity: EntityName,
  rows: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const adapted = rows.map((r) => adaptRowForApi(entity, r));
  // Each endpoint keys its body on the entity name.
  return { [entity]: adapted };
}
