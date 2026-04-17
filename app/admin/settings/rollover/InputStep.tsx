'use client';

import Link from 'next/link';
import { formatDayLabel } from '@/lib/date';
import type { CampConfig } from '@/lib/types';
import { FormState, TIMEZONE_OPTIONS } from './types';

interface Props {
  config: CampConfig;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  preview: { dayDates: Record<string, string> | null; error: string | null };
  yearValid: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function InputStep({
  config,
  form,
  setForm,
  preview,
  yearValid,
  canSubmit,
  submitting,
  onSubmit,
}: Props) {
  return (
    <>
      <section className="camp-card p-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="camp-subheading mb-0">Start a new camp year</h2>
          <div className="text-sm text-gray-600">
            Current year:{' '}
            <span className="font-mono font-semibold">{config.camp_id}</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Archive this year&apos;s attendance and session enrollments under{' '}
          <code>camps/{config.camp_id}/</code>, then advance the active camp to
          a new year with a fresh camp code. Students, faculty, periods, and
          sessions carry over.
        </p>
      </section>

      <section className="camp-card p-6">
        <h3 className="camp-subheading">
          Step 1 of 3 &mdash; Enter new year details
        </h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="camp-label" htmlFor="new-year">
                New camp year
              </label>
              <input
                id="new-year"
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                className="camp-input"
                value={form.newYear}
                onChange={(e) =>
                  setForm((p) => ({ ...p, newYear: e.target.value.trim() }))
                }
                placeholder="2027"
                required
                aria-describedby="new-year-hint"
              />
              <p
                id="new-year-hint"
                className={`text-xs mt-1 ${
                  form.newYear && !yearValid ? 'text-red-700' : 'text-gray-500'
                }`}
              >
                Must be a 4-digit year greater than {config.camp_year}.
              </p>
            </div>
            <div>
              <label className="camp-label" htmlFor="timezone">
                Timezone
              </label>
              <select
                id="timezone"
                className="camp-input"
                value={form.timezone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, timezone: e.target.value }))
                }
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
                <option value="__custom__">Custom (IANA)...</option>
              </select>
            </div>
            <div>
              <label className="camp-label" htmlFor="new-start-date">
                Start date
              </label>
              <input
                id="new-start-date"
                type="date"
                className="camp-input"
                value={form.newStartDate}
                onChange={(e) =>
                  setForm((p) => ({ ...p, newStartDate: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className="camp-label" htmlFor="new-end-date">
                End date
              </label>
              <input
                id="new-end-date"
                type="date"
                className="camp-input"
                value={form.newEndDate}
                onChange={(e) =>
                  setForm((p) => ({ ...p, newEndDate: e.target.value }))
                }
                required
              />
            </div>
            {form.timezone === '__custom__' && (
              <div className="md:col-span-2">
                <label className="camp-label" htmlFor="custom-timezone">
                  Custom IANA timezone
                </label>
                <input
                  id="custom-timezone"
                  className="camp-input"
                  value={form.customTimezone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, customTimezone: e.target.value }))
                  }
                  placeholder="Europe/London"
                  required
                />
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-camp-green focus:ring-camp-green"
                checked={form.clearEnsembleAssignments}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    clearEnsembleAssignments: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="text-sm font-medium text-gray-800">
                  Clear ensemble + chair assignments
                </span>
                <span className="block text-xs text-gray-500">
                  Resets ensemble + chair so day-1 auditions start fresh.
                </span>
              </span>
            </label>
          </div>

          <div>
            <div className="camp-label">Day keys preview</div>
            {preview.error && (
              <p className="text-sm text-red-700">{preview.error}</p>
            )}
            {preview.dayDates && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Key</th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Weekday
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(preview.dayDates).map(([key, date]) => (
                      <tr key={key}>
                        <td className="px-3 py-2 font-mono font-semibold">
                          {key}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {formatDayLabel(key)}
                        </td>
                        <td className="px-3 py-2 font-mono">{date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end items-center gap-3">
            <Link href="/admin/settings" className="camp-btn-outline px-4">
              Cancel
            </Link>
            <button
              type="submit"
              className="camp-btn-primary px-6"
              disabled={!canSubmit}
            >
              {submitting ? 'Loading preview...' : 'Preview Changes'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
