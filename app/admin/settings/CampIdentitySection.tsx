'use client';

import { useMemo, useState } from 'react';
import { deriveDayDates, formatDayLabel } from '@/lib/date';
import type { CampConfig } from '@/lib/types';

const TIMEZONE_OPTIONS = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
];

interface Props {
  config: CampConfig;
  /**
   * Sends the partial config to PUT /api/config/camp. Resolves to the
   * updated CampConfig (success) or an error message (failure). The
   * parent owns the toast/refresh side effects so this component can
   * stay focused on form state.
   */
  onSave: (patch: {
    start_date: string;
    end_date: string;
    timezone: string;
    day_dates: Record<string, string>;
  }) => Promise<{ ok: true; config: CampConfig } | { ok: false; error: string }>;
  onConfigUpdate: (next: CampConfig) => void;
}

export function CampIdentitySection({ config, onSave, onConfigUpdate }: Props) {
  const [startDate, setStartDate] = useState(config.start_date);
  const [endDate, setEndDate] = useState(config.end_date);
  const initialTz = TIMEZONE_OPTIONS.includes(config.timezone)
    ? config.timezone
    : '__custom__';
  const [timezone, setTimezone] = useState(initialTz);
  const [customTimezone, setCustomTimezone] = useState(
    initialTz === '__custom__' ? config.timezone : ''
  );
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const preview = useMemo<{
    dayDates: Record<string, string> | null;
    error: string | null;
  }>(() => {
    if (!startDate || !endDate) return { dayDates: null, error: null };
    try {
      return { dayDates: deriveDayDates(startDate, endDate), error: null };
    } catch (e) {
      return { dayDates: null, error: (e as Error).message };
    }
  }, [startDate, endDate]);

  const effectiveTimezone =
    timezone === '__custom__' ? customTimezone.trim() : timezone;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview.dayDates) return;
    setSaving(true);
    setFlash(null);
    const result = await onSave({
      start_date: startDate,
      end_date: endDate,
      timezone: effectiveTimezone,
      day_dates: preview.dayDates,
    });
    setSaving(false);
    if (result.ok) {
      onConfigUpdate(result.config);
      setFlash({ kind: 'ok', text: 'Saved' });
    } else {
      setFlash({ kind: 'err', text: result.error });
    }
  }

  return (
    <section className="camp-card p-6">
      <h2 className="camp-subheading">Camp Identity</h2>
      <p className="text-sm text-gray-500 mb-4">
        Dates, timezone, and auto-derived day keys for the active camp. The
        camp year is immutable — use the Yearly Rollover wizard to start a
        new year.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="camp-label" htmlFor="camp-year">
              Camp Year
            </label>
            <input
              id="camp-year"
              className="camp-input bg-gray-100"
              value={config.camp_year}
              readOnly
              aria-readonly="true"
            />
          </div>
          <div>
            <label className="camp-label" htmlFor="camp-id">
              Camp ID
            </label>
            <input
              id="camp-id"
              className="camp-input bg-gray-100"
              value={config.camp_id}
              readOnly
              aria-readonly="true"
            />
          </div>
          <div>
            <label className="camp-label" htmlFor="start-date">
              Start date
            </label>
            <input
              id="start-date"
              type="date"
              className="camp-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="camp-label" htmlFor="end-date">
              End date
            </label>
            <input
              id="end-date"
              type="date"
              className="camp-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="camp-label" htmlFor="timezone">
              Timezone
            </label>
            <select
              id="timezone"
              className="camp-input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              <option value="__custom__">Custom (IANA)...</option>
            </select>
          </div>
          {timezone === '__custom__' && (
            <div>
              <label className="camp-label" htmlFor="custom-timezone">
                Custom IANA timezone
              </label>
              <input
                id="custom-timezone"
                className="camp-input"
                value={customTimezone}
                onChange={(e) => setCustomTimezone(e.target.value)}
                placeholder="Europe/London"
                required
              />
            </div>
          )}
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
                    <th className="text-left px-3 py-2 font-semibold">Weekday</th>
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(preview.dayDates).map(([key, date]) => (
                    <tr key={key}>
                      <td className="px-3 py-2 font-mono font-semibold">{key}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {formatDayLabel(key)}
                      </td>
                      <td className="px-3 py-2 font-mono">{date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-2">
                For camps longer than a week, later occurrences of a weekday
                overwrite earlier ones (e.g. the 2nd Monday wins the{' '}
                <code>M</code> slot).
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end items-center gap-3">
          {flash && (
            <span
              role="status"
              className={`text-sm ${
                flash.kind === 'ok' ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {flash.text}
            </span>
          )}
          <button
            type="submit"
            className="camp-btn-primary px-6"
            disabled={
              saving ||
              !preview.dayDates ||
              (timezone === '__custom__' && customTimezone.trim().length === 0)
            }
          >
            {saving ? 'Saving...' : 'Save Camp Identity'}
          </button>
        </div>
      </form>
    </section>
  );
}
