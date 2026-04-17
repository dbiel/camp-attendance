'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  autoDetectMapping,
  type ColumnMapping,
  type ParsedFile,
} from '@/lib/import-parsers';
import { getSchema, type EntityName } from '@/lib/import-schemas';
import { loadSavedMapping } from './mapping-storage';

const SKIP = '__skip__';

interface Props {
  entity: EntityName;
  parsed: ParsedFile;
  initialMapping?: ColumnMapping | null;
  onBack: () => void;
  onConfirm: (mapping: ColumnMapping) => void;
}

export function MappingStep({
  entity,
  parsed,
  initialMapping,
  onBack,
  onConfirm,
}: Props) {
  const schema = useMemo(() => getSchema(entity), [entity]);

  // Auto-detect + saved-overlay on first mount for this parsed file.
  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    const auto = autoDetectMapping(parsed.headers, schema);
    const saved = initialMapping ?? loadSavedMapping(entity, parsed.headers);
    return saved ? { ...auto, ...saved } : auto;
  });
  const [autoDetected] = useState<ColumnMapping>(() =>
    autoDetectMapping(parsed.headers, schema),
  );
  const [rememberedKeys] = useState<Set<string>>(() => {
    const saved = initialMapping ?? loadSavedMapping(entity, parsed.headers);
    return new Set(saved ? Object.keys(saved) : []);
  });

  // If schema (entity) changes in some edge case, re-run auto-detect.
  useEffect(() => {
    setMapping(() => {
      const auto = autoDetectMapping(parsed.headers, schema);
      const saved = initialMapping ?? loadSavedMapping(entity, parsed.headers);
      return saved ? { ...auto, ...saved } : auto;
    });
  }, [entity, parsed.headers, schema, initialMapping]);

  const firstExample = useMemo(() => {
    const out: Record<string, string> = {};
    for (const header of parsed.headers) {
      const found = parsed.rows.find(
        (r) => r[header] != null && String(r[header]).trim() !== '',
      );
      out[header] = found ? String(found[header]) : '';
    }
    return out;
  }, [parsed]);

  const unmappedRequired = useMemo(() => {
    const mapped = new Set(Object.values(mapping).filter((v): v is string => !!v));
    return schema.fields.filter((f) => f.required && !mapped.has(f.key));
  }, [mapping, schema]);

  function setFor(header: string, value: string) {
    setMapping((m) => ({ ...m, [header]: value === SKIP ? null : value }));
  }

  return (
    <section aria-labelledby="import-mapping-heading">
      <h2 id="import-mapping-heading" className="camp-heading text-lg mb-2">
        Map columns to {schema.label.toLowerCase()} fields
      </h2>
      <p className="text-sm text-gray-600 mb-3">
        {parsed.filename} — {parsed.totalRows.toLocaleString()} row
        {parsed.totalRows === 1 ? '' : 's'}
        {parsed.truncated ? ' (truncated)' : ''}
      </p>

      <div className="camp-card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Column
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Example
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Map to field
              </th>
            </tr>
          </thead>
          <tbody>
            {parsed.headers.map((header) => {
              const current = mapping[header] ?? null;
              const auto = autoDetected[header] ?? null;
              const isAutoDetected = auto === current && current != null;
              const isRemembered = rememberedKeys.has(header);
              return (
                <tr key={header} className="border-b border-gray-100">
                  <th scope="row" className="px-3 py-2 font-semibold text-left">
                    {header}
                  </th>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate">
                    {firstExample[header] || (
                      <span className="italic text-gray-400">empty</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Map column ${header}`}
                        value={current ?? SKIP}
                        onChange={(e) => setFor(header, e.target.value)}
                        className="camp-input py-1 text-sm"
                      >
                        <option value={SKIP}>Skip this column</option>
                        {schema.fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {f.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                      {isAutoDetected && (
                        <span
                          title={isRemembered ? 'Remembered + auto' : 'Auto-detected'}
                          className={`inline-block w-2 h-2 rounded-full ${
                            isRemembered ? 'bg-purple-500' : 'bg-blue-500'
                          }`}
                          aria-label={
                            isRemembered
                              ? 'Remembered from previous import'
                              : 'Auto-detected'
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 mb-3 flex gap-4">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          Auto-detected
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
          Remembered
        </span>
      </div>

      {unmappedRequired.length > 0 && (
        <div
          role="alert"
          className="camp-card p-3 mb-4 border-l-4 border-red-500 bg-red-50"
        >
          <div className="font-semibold text-red-700 text-sm">
            Required fields not mapped:
          </div>
          <div className="text-sm text-red-700">
            Missing: {unmappedRequired.map((f) => f.key).join(', ')}
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <button type="button" onClick={onBack} className="camp-btn-outline">
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm(mapping)}
          disabled={unmappedRequired.length > 0}
          className="camp-btn-primary disabled:opacity-50"
        >
          Preview
        </button>
      </div>
    </section>
  );
}
