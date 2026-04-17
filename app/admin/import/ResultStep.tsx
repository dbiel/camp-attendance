'use client';

import Papa from 'papaparse';
import Link from 'next/link';
import type { EntityName } from '@/lib/import-schemas';
import type { NormalizedRow, ParsedFile } from '@/lib/import-parsers';

export interface ImportResultData {
  success: number;
  failed: number;
  errors: string[];
}

interface Props {
  entity: EntityName;
  result: ImportResultData;
  /** The original parsed file — used to build a failed-row CSV (preserves
   *  user's original headers so they can fix + re-upload). */
  parsed: ParsedFile;
  /**
   * Full normalized rows array in upload order (so index i aligns with
   * `parsed.rows[i]`). Rows with `errors.length > 0` are the client-side
   * failures; the rest were POSTed.
   */
  normalizedRows: NormalizedRow[];
  /** Server-side error messages returned from the POST (free text). */
  serverErrors: string[];
  /** Count of rows that failed client-side validation. */
  clientFailedCount: number;
  onImportMore: () => void;
}

export function ResultStep({
  entity,
  result,
  parsed,
  normalizedRows,
  serverErrors,
  clientFailedCount,
  onImportMore,
}: Props) {
  const totalFailed = clientFailedCount + result.failed;

  function downloadFailedCsv() {
    // Emit one output row per parsed.rows[i] that produced a client-side
    // validation error, preserving the admin's original columns and order.
    const clientRows: Array<Record<string, string>> = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const norm = normalizedRows[i];
      if (!norm || norm.errors.length === 0) continue;
      const errMsgs = norm.errors
        .map((e) => `${e.field}: ${e.message}`)
        .join('; ');
      clientRows.push({ ...parsed.rows[i], _errors: errMsgs });
    }

    // Server errors are appended as `_errors`-only rows — we do not know
    // which original row each maps to, so we cannot merge into input rows.
    const serverRows = serverErrors.map((msg) => ({ _errors: msg }));

    const csv = Papa.unparse(
      {
        fields: [...parsed.headers, '_errors'],
        data: [...clientRows, ...serverRows],
      },
      { newline: '\n' },
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entity}-import-failed-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-labelledby="import-result-heading"
      aria-live="polite"
      className="space-y-4"
    >
      <h2
        id="import-result-heading"
        className="camp-heading text-2xl text-camp-green"
      >
        ✓ Imported {result.success} {entity}
      </h2>

      <div className="camp-card p-4 space-y-1 text-sm">
        <div>
          <span className="font-semibold">Imported:</span> {result.success}
        </div>
        <div>
          <span className="font-semibold">Failed:</span> {totalFailed}
          {clientFailedCount > 0 && (
            <span className="text-gray-500">
              {' '}
              ({clientFailedCount} validation, {result.failed} server)
            </span>
          )}
        </div>
      </div>

      {totalFailed > 0 && (
        <div className="camp-card p-4 border-l-4 border-amber-500 bg-amber-50">
          <p className="text-sm text-gray-700 mb-2">
            Download the failed rows as CSV, fix the errors, and re-upload:
          </p>
          <button
            type="button"
            onClick={downloadFailedCsv}
            className="camp-btn-outline"
          >
            Download failed rows as CSV
          </button>
          {result.errors.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-amber-800 font-semibold">
                Server error messages ({result.errors.length})
              </summary>
              <ul className="mt-2 space-y-1 text-red-700 max-h-48 overflow-y-auto">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 50 && (
                  <li className="italic">
                    …and {result.errors.length - 50} more
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onImportMore}
          className="camp-btn-primary"
        >
          Import more
        </button>
        <Link href="/admin/dashboard" className="camp-btn-outline">
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
