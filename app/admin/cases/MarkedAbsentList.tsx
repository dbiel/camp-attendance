'use client';

import { useCallback, useEffect, useState } from 'react';
import { getTodayDate } from '@/lib/date';
import { rangeLabel } from './absence-labels';

interface Absence {
  id: string;
  student_name: string;
  date: string;
  end_date?: string;
  all_day: boolean;
  from: string;
  until: string;
  note: string | null;
}

/** Always-on board section listing the office-marked (excused) absences —
 * today + upcoming — so the office sees them without opening the Mark-absent
 * form. Each row has a Clear. Reloads on mount, when `refreshKey` bumps (after
 * the form saves), and on a light 30s poll (pause-on-hidden) so parallel
 * sessions stay in sync. */
export function MarkedAbsentList({
  getAuthHeaders,
  refreshKey,
  onChanged,
}: {
  getAuthHeaders: () => Promise<Record<string, string>>;
  refreshKey: number;
  onChanged?: () => void;
}) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/marked-absences', { headers });
      if (res.ok) setAbsences(((await res.json()).absences as Absence[]) ?? []);
    } catch {
      /* transient — keep the last list */
    } finally {
      setLoaded(true);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function clear(id: string) {
    // Optimistic removal — the row goes immediately; reload reconciles.
    setAbsences((prev) => prev.filter((a) => a.id !== id));
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/marked-absences/${id}`, { method: 'DELETE', headers });
      onChanged?.();
    } catch {
      /* transient */
    } finally {
      await load();
    }
  }

  const today = getTodayDate();

  return (
    <section className="mt-8 border-t pt-4">
      <h2 className="mb-2 text-sm font-bold text-[var(--text-2)]">
        Marked absent (office){absences.length > 0 ? ` — ${absences.length}` : ''}
      </h2>
      {loaded && absences.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No office-marked absences.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {absences.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-[var(--text)]">{a.student_name}</span>
                <span className="text-[var(--text-2)]">
                  {' · '}
                  {rangeLabel(a.date, a.end_date, today)}
                  {' · '}
                  {a.all_day ? 'All day' : `out ${a.from}–${a.until}`}
                  {a.note ? ` · ${a.note}` : ''}
                </span>
              </span>
              <button onClick={() => clear(a.id)} className="shrink-0 text-xs text-red-700 underline">
                Clear
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
