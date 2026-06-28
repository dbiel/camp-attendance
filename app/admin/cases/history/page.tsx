'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import { hourBucket, formatClock, getTodayDate } from '@/lib/date';

type StatusFilter = 'active' | 'resolved' | 'all';

function hourLabel(hh: number): string {
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:00 ${ampm}`;
}

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  // Parse at local noon so the weekday label can't roll across a tz boundary.
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CaseHistory() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [nameFilter, setNameFilter] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggledDays, setToggledDays] = useState<Set<string>>(new Set());
  const [toggledHours, setToggledHours] = useState<Set<string>>(new Set());
  // Re-render once a minute so the 'now' hour highlight + default-open advance
  // across the :59→:00 rollover without needing user interaction.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);

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

  // day → hour-bucket → cases, all keyed on occurred_at||created_at in camp tz.
  const days = useMemo(() => {
    const visible = cases.filter((c) =>
      c.student_name.toLowerCase().includes(nameFilter.toLowerCase())
    );
    const map = new Map<string, Map<string, Case[]>>();
    for (const c of visible) {
      const key = hourBucket(c.occurred_at || c.created_at); // 'YYYY-MM-DD HH'
      const day = key.slice(0, 10);
      if (!map.has(day)) map.set(day, new Map());
      const hours = map.get(day)!;
      if (!hours.has(key)) hours.set(key, []);
      hours.get(key)!.push(c);
    }
    return map;
  }, [cases, nameFilter]);

  // Today open by default (XOR a manual toggle); current hour force-open.
  const isDayOpen = (day: string) => (day === today) !== toggledDays.has(day);
  // Current hour defaults open but stays collapsible (XOR), mirroring days.
  const isHourOpen = (hourKey: string) => (hourKey === nowHourKey) !== toggledHours.has(hourKey);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set);
    n.has(k) ? n.delete(k) : n.add(k);
    setter(n);
  };

  if (loadError && cases.length === 0) {
    return (
      <main className="p-4 text-sm text-gray-500">
        <p>{loadError}</p>
        <button onClick={fetchCases} className="mt-2 rounded border px-3 py-1 text-sm">
          Retry
        </button>
      </main>
    );
  }
  if (loading && cases.length === 0) {
    return <main className="p-4 text-sm text-gray-500">Loading…</main>;
  }
  if (authLoading || !user) return null;

  const dayKeys = [...days.keys()].sort().reverse(); // most recent day first

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold">Report History</h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded border text-sm">
          {(['active', 'resolved', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 capitalize ${
                statusFilter === s ? 'bg-camp-green text-white' : 'text-gray-600'
              }`}
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

      {dayKeys.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No reports.</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {dayKeys.map((day) => {
          const hours = days.get(day)!;
          const dayCount = [...hours.values()].reduce((n, arr) => n + arr.length, 0);
          const open = isDayOpen(day);
          const hourKeys = [...hours.keys()].sort().reverse();
          return (
            <section key={day} className="rounded-lg border bg-white">
              <button
                onClick={() => toggle(toggledDays, setToggledDays, day)}
                className="flex w-full items-center justify-between p-3 text-left font-semibold"
              >
                <span>{open ? '▾' : '▸'} {dayLabel(day, today)}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{dayCount}</span>
              </button>

              {open && (
                <div className="border-t">
                  {hourKeys.map((hourKey) => {
                    const list = hours.get(hourKey)!;
                    const hh = Number(hourKey.slice(11, 13));
                    const hOpen = isHourOpen(hourKey);
                    return (
                      <div key={hourKey} className="border-b last:border-b-0">
                        <button
                          onClick={() => toggle(toggledHours, setToggledHours, hourKey)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                        >
                          <span className="text-gray-600">
                            {hOpen ? '▾' : '▸'} {hourLabel(hh)}
                            {hourKey === nowHourKey && (
                              <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">now</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-400">{list.length}</span>
                        </button>
                        {hOpen && (
                          <ul className="flex flex-col gap-1 px-3 pb-2">
                            {list.map((c) => (
                              <li key={c.id}>
                                <Link
                                  href={`/admin/cases/${c.id}`}
                                  className="block rounded border bg-gray-50 p-2 text-sm hover:bg-gray-100"
                                >
                                  <div className="flex justify-between">
                                    <span className="font-medium">{c.student_name}</span>
                                    <span className="text-gray-500">
                                      {formatClock(c.occurred_at || c.created_at)}
                                      {c.status === 'resolved' && ' · ✓'}
                                    </span>
                                  </div>
                                  <p className="text-gray-700">{c.summary}</p>
                                  {c.resolution_note && (
                                    <p className="text-green-700">→ {c.resolution_note}</p>
                                  )}
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
    </main>
  );
}
