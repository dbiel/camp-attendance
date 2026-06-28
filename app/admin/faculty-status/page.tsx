'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel } from '@/lib/date';
import { db as clientDb } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { CoverageRow } from '@/lib/types';
import { deriveCellState } from '@/lib/attendance-rules';
import { FacultyGrid } from './FacultyGrid';

export default function AdminFacultyStatus() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [onlyBehind, setOnlyBehind] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (config && selectedDay === null) {
      setSelectedDay(todayKey ?? Object.keys(config.day_dates)[0] ?? 'M');
    }
  }, [config, todayKey, selectedDay]);

  // Live listener — first tick covers initial load; no separate initial-fetch needed.
  useEffect(() => {
    if (!user || !config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) return;
    const q = query(collection(clientDb, 'attendance'), where('date', '==', date));
    const unsub = onSnapshot(q, async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance/coverage?date=${date}`, { headers });
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows as CoverageRow[]);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, config, selectedDay]);

  // "Behind" = any session today is not yet mostly-done.
  const facultyTotals = (() => {
    const map = new Map<string, CoverageRow[]>();
    for (const r of rows) if (r.faculty_id) {
      if (!map.has(r.faculty_id)) map.set(r.faculty_id, []);
      map.get(r.faculty_id)!.push(r);
    }
    let total = 0, behind = 0;
    for (const [, fr] of map) {
      total++;
      const isBehind = fr.some((r) => {
        const s = deriveCellState({
          total_students: r.total_students,
          marked_count: r.marked_count,
          absent_count: r.absent_count,
        });
        return s !== 'mostly-done';
      });
      if (isBehind) behind++;
    }
    return { total, behind };
  })();

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--text-2)]">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-2">
            <Link href="/admin/coverage" className="text-sm opacity-75 hover:opacity-100">&larr; Coverage</Link>
            <button onClick={() => signOut()} className="text-xs opacity-75 hover:opacity-100 underline">
              Sign Out
            </button>
          </div>
          <h1 className="text-2xl font-bold">Faculty Status</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-3">
          {config && Object.keys(config.day_dates).map((dayKey) => (
            <button
              key={dayKey}
              onClick={() => setSelectedDay(dayKey)}
              className={`flex-1 py-3 rounded-lg font-bold text-lg ${
                dayKey === selectedDay
                  ? 'bg-camp-green text-white shadow-md'
                  : 'bg-[var(--surface)] text-camp-green border-2 border-camp-green'
              }`}
              aria-label={formatDayLabel(dayKey)}
            >
              {dayKey}
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-[var(--text-2)]">
            <span className="font-bold">{facultyTotals.total - facultyTotals.behind}</span> /{' '}
            <span className="font-bold">{facultyTotals.total}</span> caught up
            {' · '}
            <span className="font-bold text-red-600">{facultyTotals.behind}</span> behind
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyBehind} onChange={(e) => setOnlyBehind(e.target.checked)} />
            Show only behind
          </label>
        </div>

        <FacultyGrid
          rows={rows}
          onlyBehind={onlyBehind}
          onCellClick={() => { /* session-detail modal wired in a follow-up PR */ }}
        />
      </div>
    </div>
  );
}
