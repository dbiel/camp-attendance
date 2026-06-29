'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import { hourBucket, formatClock, getTodayDate } from '@/lib/date';
import { initSeenIfEmpty, isUnseen, readSeen, type SeenMap } from '@/lib/seen';

/** Small yellow dot marking unseen activity in a bucket. */
function NewDot() {
  return (
    <span
      className="ml-1 inline-block h-2 w-2 rounded-full bg-yellow-400 align-middle"
      title="New activity since you last looked"
      aria-label="new activity"
    />
  );
}

type StatusFilter = 'active' | 'resolved' | 'all';

function hourLabel(hh: number): string {
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:00 ${ampm}`;
}

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Day → hour → incident grouped report history (camp tz). Used both on the
 * standalone Data ▸ Reports page and at the bottom of the Incident page. */
export function ReportHistory({ defaultStatus = 'all' }: { defaultStatus?: StatusFilter }) {
  const { user, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatus);
  const [nameFilter, setNameFilter] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggledDays, setToggledDays] = useState<Set<string>>(new Set());
  const [toggledHours, setToggledHours] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<SeenMap>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  // Load the seen-map after each fetch so buckets with new/updated reports dot.
  // Opening a report (its detail) records it seen → the dot clears on return.
  useEffect(() => {
    if (loading || cases.length === 0) return;
    initSeenIfEmpty(cases);
    setSeen(readSeen());
  }, [loading, cases]);

  const unseen = useCallback(
    (c: Case) => isUnseen(c, seen, { treatUnknownAsNew: true }),
    [seen]
  );

  const fetchCases = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const statuses = statusFilter === 'all' ? ['active', 'resolved'] : [statusFilter];
      const results = await Promise.all(
        statuses.map((s) =>
          fetch(`/api/cases?status=${s}`, { headers }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(`(${r.status})`))
          )
        )
      );
      setCases(results.flatMap((r) => r.cases as Case[]));
    } catch {
      setLoadError('Failed to load — tap to retry.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter]);

  useEffect(() => {
    if (user) fetchCases();
  }, [user, fetchCases]);

  const today = getTodayDate();
  const nowHourKey = hourBucket(new Date().toISOString());

  const days = useMemo(() => {
    const visible = cases.filter((c) =>
      c.student_name.toLowerCase().includes(nameFilter.toLowerCase())
    );
    const map = new Map<string, Map<string, Case[]>>();
    for (const c of visible) {
      const key = hourBucket(c.occurred_at || c.created_at);
      const day = key.slice(0, 10);
      if (!map.has(day)) map.set(day, new Map());
      const hours = map.get(day)!;
      if (!hours.has(key)) hours.set(key, []);
      hours.get(key)!.push(c);
    }
    return map;
  }, [cases, nameFilter]);

  const isDayOpen = (day: string) => (day === today) !== toggledDays.has(day);
  const isHourOpen = (hourKey: string) => (hourKey === nowHourKey) !== toggledHours.has(hourKey);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set);
    n.has(k) ? n.delete(k) : n.add(k);
    setter(n);
  };

  if (loadError && cases.length === 0) {
    return (
      <div className="text-sm text-[var(--text-3)]">
        <p>{loadError}</p>
        <button onClick={fetchCases} className="mt-2 rounded border px-3 py-1 text-sm">Retry</button>
      </div>
    );
  }
  if (loading && cases.length === 0) return <p className="text-sm text-[var(--text-3)]">Loading history…</p>;

  const dayKeys = [...days.keys()].sort().reverse();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded border text-sm">
          {(['active', 'resolved', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 capitalize ${statusFilter === s ? 'bg-camp-green text-white' : 'text-[var(--text-2)]'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="Filter by student name…"
          className="flex-1 rounded border p-2 text-sm"
        />
      </div>

      {dayKeys.length === 0 && <p className="text-sm text-[var(--text-3)]">No reports.</p>}

      <div className="flex flex-col gap-3">
        {dayKeys.map((day) => {
          const hours = days.get(day)!;
          const dayCount = [...hours.values()].reduce((n, arr) => n + arr.length, 0);
          const dayActive = [...hours.values()].reduce(
            (n, arr) => n + arr.filter((c) => c.status === 'active').length,
            0
          );
          const open = isDayOpen(day);
          const dayNew = [...hours.values()].some((arr) => arr.some(unseen));
          const hourKeys = [...hours.keys()].sort().reverse();
          return (
            <section key={day} className="glass-card">
              <button
                onClick={() => toggle(toggledDays, setToggledDays, day)}
                className="flex w-full items-center justify-between p-3 text-left font-semibold"
              >
                <span>{open ? '▾' : '▸'} {dayLabel(day, today)}{dayNew && <NewDot />}</span>
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--text-2)]">
                  {dayCount}
                  {dayActive > 0 && <span className="font-semibold text-red-700"> ({dayActive} still active)</span>}
                </span>
              </button>
              {open && (
                <div className="border-t border-[var(--glass-border)]">
                  {hourKeys.map((hourKey) => {
                    const list = hours.get(hourKey)!;
                    const hourActive = list.filter((c) => c.status === 'active').length;
                    const hourNew = list.some(unseen);
                    const hh = Number(hourKey.slice(11, 13));
                    const hOpen = isHourOpen(hourKey);
                    return (
                      <div key={hourKey} className="border-b border-[var(--glass-border)] last:border-b-0">
                        <button
                          onClick={() => toggle(toggledHours, setToggledHours, hourKey)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                        >
                          {/* Active reports turn the hour red — kids still missing in that period. */}
                          <span className={hourActive > 0 ? 'font-semibold text-red-700' : 'text-[var(--text-2)]'}>
                            {hOpen ? '▾' : '▸'} {hourLabel(hh)}
                            {hourNew && <NewDot />}
                            {hourKey === nowHourKey && (
                              <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">now</span>
                            )}
                          </span>
                          <span className="text-xs text-[var(--text-3)]">
                            {list.length}
                            {hourActive > 0 && <span className="font-semibold text-red-700"> ({hourActive} active)</span>}
                          </span>
                        </button>
                        {hOpen && (
                          <ul className="flex flex-col gap-1 px-3 pb-2">
                            {[...list]
                              .sort(
                                (a, b) =>
                                  new Date(b.occurred_at || b.created_at).getTime() -
                                  new Date(a.occurred_at || a.created_at).getTime()
                              )
                              .map((c) => (
                              <li key={c.id}>
                                <Link
                                  href={`/admin/cases/${c.id}`}
                                  className="block rounded border border-[var(--glass-border)] bg-[var(--surface)] p-2 text-sm hover:bg-[var(--accent-soft)]"
                                >
                                  <div className="flex justify-between">
                                    <span className="font-medium">{c.student_name}{unseen(c) && <NewDot />}</span>
                                    <span className="text-[var(--text-3)]">
                                      {formatClock(c.occurred_at || c.created_at)}
                                      {c.status === 'resolved' && ' · ✓'}
                                    </span>
                                  </div>
                                  <p className="text-[var(--text-2)]">{c.summary}</p>
                                  {c.resolution_note && <p className="text-green-700">→ {c.resolution_note}</p>}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
