'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface GridRow {
  ensemble: string;
  day_key: string;
  period_number: number;
  period_name: string;
  roster_size: number;
  absent_count: number;
  submitted_at: string;
}

/**
 * Read-only ensemble attendance: ensemble (row) × camp day (col), each cell
 * listing the periods attendance was taken that day with the absent count.
 * Mirrors what the public `/e` links file each hour. Admin sees every period,
 * regardless of the takers' hourly rollover.
 */
export function EnsembleAttendanceGrid() {
  const { getAuthHeaders } = useAuth();
  const [rows, setRows] = useState<GridRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/ensemble-attendance', { headers: await getAuthHeaders() });
        if (!res.ok) {
          setError('Could not load attendance.');
          return;
        }
        const j = (await res.json()) as { rows: GridRow[] };
        setRows(j.rows);
      } catch {
        setError('Could not load attendance.');
      }
    })();
  }, [getAuthHeaders]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-[var(--text-3)]">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-[var(--text-3)]">No attendance taken yet.</p>;

  const days = [...new Set(rows.map((r) => r.day_key))];
  const ensembles = [...new Set(rows.map((r) => r.ensemble))].sort();
  const cell = (ens: string, day: string) =>
    rows.filter((r) => r.ensemble === ens && r.day_key === day).sort((a, b) => a.period_number - b.period_number);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-[var(--glass-border)] p-2 text-left">Ensemble</th>
            {days.map((d) => (
              <th key={d} className="border-b border-[var(--glass-border)] p-2 text-left">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ensembles.map((ens) => (
            <tr key={ens}>
              <td className="border-b border-[var(--glass-border)] p-2 font-semibold">{ens}</td>
              {days.map((d) => (
                <td key={d} className="border-b border-[var(--glass-border)] p-2 align-top">
                  <div className="flex flex-col gap-1">
                    {cell(ens, d).map((r) => (
                      <span key={r.period_number} className="whitespace-nowrap text-xs text-[var(--text-2)]">
                        {r.period_name}: {r.absent_count}/{r.roster_size} absent
                      </span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
