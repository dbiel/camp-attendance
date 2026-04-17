'use client';

import type { CampConfig } from '@/lib/types';
import { FormState, RolloverResult } from './types';

interface Props {
  config: CampConfig;
  form: FormState;
  previewResult: RolloverResult;
  effectiveTimezone: string;
  confirmText: string;
  setConfirmText: (v: string) => void;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onRetryPreview: () => Promise<void>;
}

export function PreviewStep({
  config,
  form,
  previewResult,
  effectiveTimezone,
  confirmText,
  setConfirmText,
  submitting,
  onBack,
  onConfirm,
  onRetryPreview,
}: Props) {
  const expected = `ROLLOVER ${form.newYear.trim()}`;
  const matches = confirmText.trim() === expected;

  return (
    <section className="camp-card p-6 border-2 border-amber-400 bg-amber-50">
      <h3 className="camp-subheading text-amber-900">
        Step 2 of 3 &mdash; Review and confirm
      </h3>
      <p className="text-sm text-amber-900 mb-4">
        The following changes will be applied when you run the rollover. This
        action cannot be undone.
      </p>

      <ul className="space-y-2 text-sm text-gray-800 mb-6">
        <li>
          <span className="font-semibold">
            Archiving year {previewResult.old_id}:
          </span>{' '}
          {previewResult.archived.attendance} attendance records,{' '}
          {previewResult.archived.session_students} session enrollments &rarr;{' '}
          <code>camps/{previewResult.old_id}/</code>
        </li>
        <li>Clearing live attendance and session_students tables.</li>
        <li>
          Setting active camp to{' '}
          <span className="font-mono font-semibold">{previewResult.new_id}</span>{' '}
          ({form.newStartDate} to {form.newEndDate}, {effectiveTimezone}).
        </li>
        {form.clearEnsembleAssignments && (
          <li>Clearing ensemble + chair_number on all student records.</li>
        )}
        <li className="pt-2 border-t border-amber-200">
          <span className="font-semibold">
            A new camp code will be generated.
          </span>{' '}
          Teachers will need to re-enter it.
        </li>
      </ul>

      <div className="bg-white border border-amber-300 rounded p-4 mb-4">
        <label htmlFor="confirm-text" className="camp-label">
          Type <span className="font-mono font-semibold">{expected}</span> to
          confirm
        </label>
        <input
          id="confirm-text"
          type="text"
          className="camp-input font-mono"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={submitting}
          autoComplete="off"
          aria-describedby="confirm-hint"
          placeholder={expected}
        />
        <p id="confirm-hint" className="text-xs text-gray-500 mt-1">
          Type &ldquo;{expected}&rdquo; to confirm. Case-sensitive.
        </p>
      </div>

      {submitting && (
        <div
          role="status"
          className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          <div className="font-semibold">
            Rolling over... this may take a few minutes.
          </div>
          <div className="text-xs opacity-80">
            Processing attendance and enrollment archives in batches of 400.
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end items-center gap-3">
        <button
          type="button"
          className="camp-btn-outline px-4"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          className="camp-btn-outline px-4"
          onClick={onRetryPreview}
          disabled={submitting}
        >
          Try again
        </button>
        <button
          type="button"
          className="camp-btn bg-red-600 hover:bg-red-700 text-white px-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
          onClick={onConfirm}
          disabled={!matches || submitting || !config}
          aria-label="Run Rollover (destructive)"
        >
          {submitting ? 'Rolling over...' : 'Run Rollover'}
        </button>
      </div>
    </section>
  );
}
