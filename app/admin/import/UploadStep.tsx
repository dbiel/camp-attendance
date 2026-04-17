'use client';

import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { parseFile, type ParsedFile } from '@/lib/import-parsers';
import type { EntityName } from '@/lib/import-schemas';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS = 10_000;

interface Props {
  entity: EntityName;
  onParsed: (parsed: ParsedFile) => void;
  onBack: () => void;
  onError: (message: string) => void;
}

export function UploadStep({ entity, onParsed, onBack, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). ` +
          `Max is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
      );
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseFile(file, { maxRows: MAX_ROWS });
      if (parsed.rows.length === 0) {
        onError('No data rows found in file.');
        return;
      }
      onParsed(parsed);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setBusy(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so re-uploading the same filename fires onChange.
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave() {
    setDragActive(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <section aria-labelledby="import-upload-heading">
      <h2 id="import-upload-heading" className="camp-heading text-lg mb-2">
        Upload {entity} file
      </h2>
      <p className="text-sm text-gray-600 mb-3">
        Accepts .csv or .xlsx. Max {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB /{' '}
        {MAX_ROWS.toLocaleString()} rows.
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file by dropping it here or pressing Enter to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={onKeyDown}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-camp-green ${
          dragActive
            ? 'border-camp-green bg-camp-green/5'
            : 'border-gray-300 hover:border-camp-green/60 bg-white'
        }`}
      >
        {busy ? (
          <div className="text-gray-600">Parsing file…</div>
        ) : (
          <>
            <div className="text-camp-green font-semibold text-lg">
              Drop file here
            </div>
            <div className="text-sm text-gray-600 mt-1">
              or click to browse (.csv, .xlsx)
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onInputChange}
          className="hidden"
          disabled={busy}
        />
      </div>

      <div className="flex justify-start mt-4">
        <button
          type="button"
          onClick={onBack}
          className="camp-btn-outline"
          disabled={busy}
        >
          Back
        </button>
      </div>
    </section>
  );
}
