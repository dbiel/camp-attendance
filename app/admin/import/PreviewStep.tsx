'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/Modal';
import {
  normalizeRows,
  type ColumnMapping,
  type NormalizeResult,
  type NormalizedRow,
  type ParsedFile,
} from '@/lib/import-parsers';
import { getSchema, type EntityName } from '@/lib/import-schemas';

interface Props {
  entity: EntityName;
  parsed: ParsedFile;
  mapping: ColumnMapping;
  importing: boolean;
  onBack: () => void;
  onImport: (validRows: NormalizedRow[]) => void;
  /** Fires with the full normalized row set so the Result step can
      build a failed-rows CSV without re-normalizing. */
  onNormalized?: (rows: NormalizedRow[]) => void;
}

const MAX_ERRORS_SHOWN = 100;

export function PreviewStep({
  entity,
  parsed,
  mapping,
  importing,
  onBack,
  onImport,
  onNormalized,
}: Props) {
  const schema = useMemo(() => getSchema(entity), [entity]);
  const normalized: NormalizeResult = useMemo(
    () => normalizeRows(parsed.rows, schema, mapping),
    [parsed.rows, schema, mapping],
  );

  // Lift normalized rows to parent whenever they change — lets the Result
  // step build a failed-rows CSV without re-normalizing.
  useEffect(() => {
    onNormalized?.(normalized.rows);
  }, [normalized, onNormalized]);

  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewRows = normalized.rows.slice(0, 5);
  const allErrors: Array<{ row: number; field: string; message: string }> = [];
  normalized.rows.forEach((r, idx) => {
    for (const err of r.errors) {
      allErrors.push({ row: idx + 1, field: err.field, message: err.message });
    }
  });

  function confirmImport() {
    const valid = normalized.rows.filter((r) => r.errors.length === 0);
    setConfirmOpen(false);
    onImport(valid);
  }

  return (
    <section aria-labelledby="import-preview-heading">
      <h2 id="import-preview-heading" className="camp-heading text-lg mb-3">
        Preview & import
      </h2>

      <div className="camp-card p-3 mb-4 flex flex-wrap gap-4 text-sm">
        <span className="text-green-700 font-semibold">
          ✓ {normalized.validCount} ready
        </span>
        <span className="text-red-700 font-semibold">
          ✗ {normalized.errorCount} with errors
        </span>
        <span className="text-gray-600">
          {normalized.rows.length} total rows
        </span>
      </div>

      <div className="camp-card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Row
              </th>
              {schema.fields.map((f) => (
                <th key={f.key} scope="col" className="px-3 py-2 text-left">
                  {f.label}
                  {f.required ? ' *' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 && (
              <tr>
                <td
                  colSpan={schema.fields.length + 1}
                  className="px-3 py-4 text-gray-500 text-center"
                >
                  No rows to preview
                </td>
              </tr>
            )}
            {previewRows.map((row, idx) => {
              const erroredFields = new Set(row.errors.map((e) => e.field));
              return (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  {schema.fields.map((f) => {
                    const hasErr = erroredFields.has(f.key);
                    const val = row.data[f.key];
                    const display =
                      val == null || val === '' ? '' : String(val);
                    return (
                      <td
                        key={f.key}
                        className={`px-3 py-2 ${
                          hasErr ? 'bg-red-50 text-red-700' : 'text-gray-700'
                        }`}
                        title={
                          hasErr
                            ? row.errors
                                .filter((e) => e.field === f.key)
                                .map((e) => e.message)
                                .join('; ')
                            : undefined
                        }
                      >
                        {display || (
                          <span className="italic text-gray-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {normalized.errorCount > 0 && (
        <div className="camp-card mb-4">
          <button
            type="button"
            onClick={() => setShowErrors((v) => !v)}
            className="w-full text-left px-3 py-2 font-semibold text-red-700 hover:bg-red-50"
            aria-expanded={showErrors}
          >
            {showErrors ? '▾' : '▸'} Show errors ({allErrors.length})
          </button>
          {showErrors && (
            <ul className="px-3 py-2 text-xs text-red-700 max-h-64 overflow-y-auto space-y-1 border-t border-gray-200">
              {allErrors.slice(0, MAX_ERRORS_SHOWN).map((e, i) => (
                <li key={i}>
                  <span className="font-mono">Row {e.row}:</span> {e.field} —{' '}
                  {e.message}
                </li>
              ))}
              {allErrors.length > MAX_ERRORS_SHOWN && (
                <li className="italic text-red-600">
                  …and {allErrors.length - MAX_ERRORS_SHOWN} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="camp-btn-outline"
          disabled={importing}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={importing || normalized.validCount === 0}
          className="camp-btn-primary disabled:opacity-50"
        >
          {importing
            ? 'Importing…'
            : `Import ${normalized.validCount} valid row${
                normalized.validCount === 1 ? '' : 's'
              }`}
        </button>
      </div>

      <Modal
        open={confirmOpen}
        title="Confirm import"
        onClose={() => setConfirmOpen(false)}
        size="md"
      >
        <p className="mb-4 text-gray-700">
          Import {normalized.validCount} {entity} into the database?
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="camp-btn-outline"
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="camp-btn-primary"
            onClick={confirmImport}
          >
            Import
          </button>
        </div>
      </Modal>
    </section>
  );
}
