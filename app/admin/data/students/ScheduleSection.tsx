'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import type { ScheduleGridRow } from '@/lib/types';
import type { StudentScheduleSlot } from '@/lib/firestore';

interface PeriodGroup {
  period_id: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  sessions: ScheduleGridRow[];
}

/** One dropdown per period, populated from every session offered that period.
 * Selecting a session PUTs it immediately (like any other <select>) rather
 * than waiting on the surrounding form's Save button — each change is its
 * own atomic enrollment write, independent of the student-record PUT. */
export function ScheduleSection({ studentId }: { studentId: string }) {
  const { getAuthHeaders } = useAuth();
  const { push } = useToast();
  const [periods, setPeriods] = useState<PeriodGroup[] | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [savingPeriod, setSavingPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const [gridRes, slotsRes] = await Promise.all([
          fetch('/api/schedule', { headers }),
          fetch(`/api/students/${studentId}/schedule?format=slots`, { headers }),
        ]);
        const grid = gridRes.ok ? ((await gridRes.json()) as ScheduleGridRow[]) : [];
        const slots = slotsRes.ok
          ? (((await slotsRes.json()).slots ?? []) as StudentScheduleSlot[])
          : [];
        if (cancelled) return;

        const byPeriod = new Map<string, PeriodGroup>();
        for (const row of grid) {
          let g = byPeriod.get(row.period_id);
          if (!g) {
            g = {
              period_id: row.period_id,
              period_number: row.period_number,
              period_name: row.period_name,
              start_time: row.start_time,
              end_time: row.end_time,
              sessions: [],
            };
            byPeriod.set(row.period_id, g);
          }
          g.sessions.push(row);
        }
        for (const g of byPeriod.values()) {
          g.sessions.sort((a, b) => a.name.localeCompare(b.name));
        }

        setPeriods([...byPeriod.values()].sort((a, b) => a.period_number - b.period_number));
        const map: Record<string, string> = {};
        for (const s of slots) map[s.period_id] = s.session_id;
        setAssigned(map);
      } catch {
        if (!cancelled) push({ kind: 'error', text: 'Failed to load schedule' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function changePeriod(periodId: string, sessionId: string) {
    const previous = assigned[periodId];
    setAssigned((prev) => ({ ...prev, [periodId]: sessionId }));
    setSavingPeriod(periodId);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/students/${studentId}/schedule`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ period_id: periodId, session_id: sessionId || null }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
    } catch (err) {
      setAssigned((prev) => ({ ...prev, [periodId]: previous }));
      const msg = err instanceof Error ? err.message : 'Failed to update schedule';
      push({ kind: 'error', text: msg });
    } finally {
      setSavingPeriod(null);
    }
  }

  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold uppercase text-[var(--text-3)] tracking-wide mb-2">
        Schedule
      </h3>
      {loading && <p className="text-sm text-[var(--text-3)]">Loading schedule…</p>}
      {!loading && periods && periods.length === 0 && (
        <p className="text-sm text-[var(--text-3)]">No periods configured.</p>
      )}
      {!loading && periods && periods.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {periods.map((p) => (
            <div key={p.period_id}>
              <label className="camp-label" htmlFor={`sched-${p.period_id}`}>
                {p.period_name}{' '}
                <span className="font-normal text-[var(--text-3)]">
                  {p.start_time}–{p.end_time}
                </span>
              </label>
              <select
                id={`sched-${p.period_id}`}
                value={assigned[p.period_id] ?? ''}
                onChange={(e) => changePeriod(p.period_id, e.target.value)}
                disabled={savingPeriod === p.period_id}
                className="camp-input"
              >
                <option value="">— none —</option>
                {p.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.ensemble ? ` (${s.ensemble})` : ''}
                    {s.location ? ` · ${s.location}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
