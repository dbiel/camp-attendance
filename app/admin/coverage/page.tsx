'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel } from '@/lib/date';
import { db as clientDb } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { CoverageRow } from '@/lib/types';
import { deriveCellState, CellState } from '@/lib/attendance-rules';
import { CoverageGrid } from './CoverageGrid';
import { CoverageFilters } from './CoverageFilters';

export default function AdminCoverage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [teacherFilter, setTeacherFilter] = useState('');
  const [ensembleFilter, setEnsembleFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<CellState | 'all'>('all');

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (config && selectedDay === null) {
      const firstDay = Object.keys(config.day_dates)[0] ?? 'M';
      setSelectedDay(todayKey ?? firstDay);
    }
  }, [config, todayKey, selectedDay]);

  // Initial snapshot
  useEffect(() => {
    if (!user || !config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) return;
    setLoading(true);
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance/coverage?date=${date}`, { headers });
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows as CoverageRow[]);
      }
      setLoading(false);
    })();
  }, [user, config, selectedDay, getAuthHeaders]);

  // Live listener — any attendance change for the date triggers a re-fetch.
  // Simpler than diffing client-side; the API call is cheap.
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
  }, [user, config, selectedDay, getAuthHeaders]);

  const teachers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.faculty_id) map.set(r.faculty_id, r.teacher_name);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const ensembles = useMemo(
    () => Array.from(new Set(rows.map(r => r.ensemble).filter((v): v is string => !!v))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (teacherFilter && r.faculty_id !== teacherFilter) return false;
      if (ensembleFilter && r.ensemble !== ensembleFilter) return false;
      if (stateFilter !== 'all') {
        const s = deriveCellState({
          total_students: r.total_students,
          marked_count: r.marked_count,
          absent_count: r.absent_count,
        });
        if (s !== stateFilter) return false;
      }
      return true;
    });
  }, [rows, teacherFilter, ensembleFilter, stateFilter]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-2">
            <Link href="/" className="text-sm opacity-75 hover:opacity-100">&larr; Home</Link>
            <button onClick={() => signOut()} className="text-xs opacity-75 hover:opacity-100 underline">
              Sign Out
            </button>
          </div>
          <h1 className="text-2xl font-bold">Coverage</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-3">
          {config && Object.keys(config.day_dates).map((dayKey) => {
            const isSelected = dayKey === selectedDay;
            const isToday = dayKey === todayKey;
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDay(dayKey)}
                aria-label={`${formatDayLabel(dayKey)}${isToday ? ' (today)' : ''}`}
                className={`flex-1 py-3 rounded-lg font-bold text-lg ${
                  isSelected
                    ? 'bg-camp-green text-white shadow-md'
                    : 'bg-white text-camp-green border-2 border-camp-green'
                }`}
              >
                {dayKey}
              </button>
            );
          })}
        </div>

        <CoverageFilters
          teachers={teachers}
          ensembles={ensembles}
          selectedTeacher={teacherFilter}
          selectedEnsemble={ensembleFilter}
          selectedState={stateFilter}
          onChange={(next) => {
            if (next.teacher !== undefined) setTeacherFilter(next.teacher);
            if (next.ensemble !== undefined) setEnsembleFilter(next.ensemble);
            if (next.state !== undefined) setStateFilter(next.state);
          }}
        />

        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : (
          <CoverageGrid rows={filtered} onSessionClick={() => { /* session-detail modal wired in a follow-up PR */ }} />
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <Link href="/admin/dashboard" className="camp-btn-outline block text-center py-3 font-semibold">
            Absences
          </Link>
          <Link href="/admin/faculty-status" className="camp-btn-outline block text-center py-3 font-semibold">
            Faculty Status
          </Link>
          <Link href="/admin/data/students" className="camp-btn-outline block text-center py-3 font-semibold">
            Students
          </Link>
          <Link href="/admin/data/faculty" className="camp-btn-outline block text-center py-3 font-semibold">
            Faculty
          </Link>
          <Link href="/admin/settings" className="camp-btn-outline block text-center py-3 font-semibold">
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
