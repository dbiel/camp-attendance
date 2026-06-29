'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { formatClock } from '@/lib/date';
import type { AttendanceHistory, AttendanceListItem } from '@/lib/attendance-history';

/**
 * Read-only admin "Attendance History": which ensembles took attendance, when,
 * and which scheduled rehearsals were missed — for the past periods of a
 * selectable day. Grid (default) shows the at-a-glance "who's missing" board;
 * List shows every submission chronologically (including force-opened ones).
 */

type View = 'grid' | 'list';
type Selected = { ensemble: string; period: number } | null;

/** "Period 4A" → "P4A", "Assembly" → "Assembly". The period `number` is just an
 * ordering index (1–10) and does NOT equal the displayed period, so always
 * label from the name. */
function shortPeriod(name: string): string {
  return name.replace(/^Period\s+/, 'P');
}

export function AttendanceHistoryView() {
  const { getAuthHeaders } = useAuth();
  const [view, setView] = useState<View>('grid');
  const [day, setDay] = useState<string | null>(null); // null → server default (today)
  const [data, setData] = useState<AttendanceHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Selected>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = day ? `?day=${encodeURIComponent(day)}` : '';
        const res = await fetch(`/api/admin/attendance-history${qs}`, { headers: await getAuthHeaders() });
        if (!res.ok) {
          if (!cancelled) setError('Could not load attendance history.');
          return;
        }
        const j = (await res.json()) as AttendanceHistory;
        if (!cancelled) {
          setData(j);
          setSelected(null);
          if (day === null) setDay(j.day); // pin the resolved day so the picker reflects it
        }
      } catch {
        if (!cancelled) setError('Could not load attendance history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day, getAuthHeaders]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm text-[var(--text-2)]">
          Day{' '}
          <select
            className="ml-1 rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1 text-sm"
            value={day ?? ''}
            onChange={(e) => setDay(e.target.value)}
          >
            {(data?.availableDays ?? (day ? [day] : [])).map((d) => (
              <option key={d} value={d}>
                {d}
                {d === data?.availableDays?.[0] ? ' (today)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="glass inline-flex rounded-full p-1 text-sm">
          {(['grid', 'list'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-3.5 py-1 capitalize ${
                view === v ? 'bg-white/60 font-semibold text-[var(--text)] shadow-sm' : 'text-[var(--text-2)]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--text-3)]">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && data && (
        <>
          {view === 'grid' ? (
            <GridView data={data} selected={selected} onSelect={setSelected} />
          ) : (
            <ListView data={data} />
          )}
        </>
      )}
    </div>
  );
}

function GridView({
  data,
  selected,
  onSelect,
}: {
  data: AttendanceHistory;
  selected: Selected;
  onSelect: (s: Selected) => void;
}) {
  const sel =
    selected &&
    (() => {
      const cell = data.cells[selected.ensemble]?.[selected.period];
      if (!cell || cell.state !== 'taken') return null;
      const p = data.periods.find((x) => x.number === selected.period);
      return {
        ensemble: selected.ensemble,
        label: p ? p.name : `Period ${selected.period}`,
        ...cell,
      };
    })();

  if (data.periods.length === 0) {
    return <p className="text-sm text-[var(--text-3)]">No past periods yet for this day.</p>;
  }

  return (
    <div>
      {sel && (
        <div className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          <span className="font-semibold">{sel.ensemble}</span> · {sel.label} · taken{' '}
          {formatClock(sel.submitted_at)} · {sel.absent_count} of {sel.roster_size} absent
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--surface)] border-b border-[var(--glass-border)] p-2 text-left">
                Ensemble
              </th>
              {data.periods.map((p) => (
                <th key={p.number} className="border-b border-[var(--glass-border)] p-2 text-center">
                  <div className="font-semibold whitespace-nowrap">{shortPeriod(p.name)}</div>
                  <div className="text-[10px] font-normal text-[var(--text-3)]">
                    {p.start_time}–{p.end_time}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.ensembles.map((ens) => (
              <tr key={ens}>
                <td className="sticky left-0 z-10 bg-[var(--surface)] border-b border-[var(--glass-border)] p-2 font-semibold whitespace-nowrap">
                  {ens}
                </td>
                {data.periods.map((p) => {
                  const cell = data.cells[ens]?.[p.number] ?? { state: 'none' as const };
                  const isSel = selected?.ensemble === ens && selected?.period === p.number;
                  if (cell.state === 'taken') {
                    return (
                      <td key={p.number} className="border-b border-[var(--glass-border)] p-1 text-center">
                        <button
                          type="button"
                          onClick={() => onSelect(isSel ? null : { ensemble: ens, period: p.number })}
                          title={`Taken ${formatClock(cell.submitted_at)} · ${cell.absent_count}/${cell.roster_size} absent`}
                          className={`w-full rounded-md px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 ${
                            isSel ? 'ring-2 ring-green-500' : ''
                          }`}
                        >
                          {cell.absent_count > 0 ? `${cell.absent_count} abs` : '✓'}
                        </button>
                      </td>
                    );
                  }
                  if (cell.state === 'missed') {
                    return (
                      <td key={p.number} className="border-b border-[var(--glass-border)] p-1 text-center">
                        <span
                          title="Rehearsal scheduled — attendance not taken"
                          className="block w-full rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-400"
                        >
                          —
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={p.number}
                      className="border-b border-[var(--glass-border)] p-1 text-center text-[var(--text-3)]/40"
                    >
                      ·
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--text-3)]">
        <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">took attendance</span>{' '}
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-400">— scheduled, not taken</span>{' '}
        <span className="px-1.5">· no rehearsal</span>. Force-opened attendance appears only in the List view.
      </p>
    </div>
  );
}

function ListView({ data }: { data: AttendanceHistory }) {
  // Group by period_name, preserving the list's newest-first order of first
  // appearance. Grouping by name (not period_number) avoids conflating a
  // force-opened clock hour with a real period that shares the same number.
  const groups = useMemo(() => {
    const byName = new Map<string, AttendanceListItem[]>();
    for (const item of data.list) {
      if (!byName.has(item.period_name)) byName.set(item.period_name, []);
      byName.get(item.period_name)!.push(item);
    }
    return [...byName.entries()]; // Map preserves insertion (= newest-first) order
  }, [data.list]);

  if (data.list.length === 0) {
    return <p className="text-sm text-[var(--text-3)]">No attendance taken yet for this day.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map(([periodName, items]) => (
        <div key={periodName}>
          <h3 className="mb-1 text-sm font-semibold text-[var(--text-2)]">{periodName}</h3>
          <ul className="divide-y divide-[var(--glass-border)] rounded-lg border border-[var(--glass-border)]">
            {items.map((item, i) => (
              <li key={`${item.ensemble}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">
                  {item.ensemble}
                  {item.forced && <span className="ml-2 text-xs text-[var(--text-3)]">(force-opened)</span>}
                </span>
                <span className="text-[var(--text-2)]">
                  taken {formatClock(item.submitted_at)}
                  {item.absent_count > 0 && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                      {item.absent_count} abs
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
