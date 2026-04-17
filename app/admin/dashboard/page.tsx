'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel, getTodayDate } from '@/lib/date';
import { db as clientDb } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { StudentDetailModal } from './StudentDetailModal';
import type { Student } from '@/lib/types';

const PERIODS = [
  { num: 1, label: 'Period 1', time: '8:00-8:50' },
  { num: 2, label: 'Period 2', time: '9:00-9:50' },
  { num: 3, label: 'Period 3', time: '10:00-10:50' },
  { num: 4, label: 'Period 4A', time: '11:00-11:50' },
  { num: 5, label: 'Period 4B', time: '12:00-12:50' },
  { num: 6, label: 'Period 5', time: '1:00-1:50' },
  { num: 7, label: 'Period 6', time: '2:00-2:50' },
  { num: 8, label: 'Assembly', time: '3:00-3:50' },
  { num: 9, label: 'Period 7', time: '4:00-4:50' },
  { num: 10, label: 'Period 8', time: '5:00-6:00' },
];

interface AbsenceRecord {
  student_id: string;
  first_name: string;
  last_name: string;
  instrument: string;
  ensemble: string;
  // Parent PII + dorm info are NOT denormalized onto attendance docs any
  // more. These fields will be null on the live listener until Wave 3
  // replaces the listener with a server-joined /api/attendance/report fetch.
  dorm_building: string | null;
  dorm_room: string | null;
  parent_phone: string | null;
  cell_phone: string | null;
  email: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  session_name: string;
  session_id: string;
  status: 'absent' | 'tardy';
  period_number: number;
  period_name: string;
  teacher_name: string;
  date: string;
}

interface SessionGroup {
  session_name: string;
  session_id: string;
  period_number: number;
  period_name: string;
  teacher_name: string;
  students: AbsenceRecord[];
}

interface SearchResult {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  instrument: string;
  ensemble: string | null;
  dorm_building: string | null;
  dorm_room: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [allRecords, setAllRecords] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [studentFilter, setStudentFilter] = useState('');
  const [ensembleFilter, setEnsembleFilter] = useState('');
  const [instrumentFilter, setInstrumentFilter] = useState('');
  const [dormFilter, setDormFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'absent' | 'tardy'>('absent');

  // Roster-wide search (finds students NOT already in the absence list)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTruncated, setSearchTruncated] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
    }
  }, [user, authLoading, router]);

  // Default selection to "today" once camp config loads.
  useEffect(() => {
    if (config && selectedDay === null) {
      const firstDay = Object.keys(config.day_dates)[0] ?? 'M';
      setSelectedDay(todayKey ?? firstDay);
    }
  }, [config, todayKey, selectedDay]);

  // Real-time Firestore listener — replaces 15-second polling
  useEffect(() => {
    if (!user || !config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) return;

    setLoading(true);

    const q = query(
      collection(clientDb, 'attendance'),
      where('date', '==', date),
      where('status', 'in', ['absent', 'tardy'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: AbsenceRecord[] = snapshot.docs.map(doc => {
        const d = doc.data();
        // NOTE: parent PII + dorm fields are no longer denormalized onto
        // attendance docs. The live listener now reads null for those.
        // TODO(Wave 3 UX): replace this listener with a fetch to
        // /api/attendance/report which joins contact info server-side,
        // or open the student detail modal for full contact.
        return {
          student_id: d.student_id,
          first_name: d.first_name,
          last_name: d.last_name,
          instrument: d.instrument,
          ensemble: d.ensemble,
          dorm_building: d.dorm_building ?? null,
          dorm_room: d.dorm_room ?? null,
          parent_phone: d.parent_phone ?? null,
          cell_phone: d.cell_phone ?? null,
          email: d.email ?? null,
          parent_first_name: d.parent_first_name ?? null,
          parent_last_name: d.parent_last_name ?? null,
          session_name: d.session_name,
          session_id: d.session_id,
          status: d.status,
          period_number: d.period_number,
          period_name: d.period_name,
          teacher_name: d.teacher_name,
          date: d.date,
        };
      });

      // Sort: period, ensemble, last name, first name
      records.sort((a, b) => {
        if (a.period_number !== b.period_number) return a.period_number - b.period_number;
        if (a.ensemble !== b.ensemble) return (a.ensemble || '').localeCompare(b.ensemble || '');
        if (a.last_name !== b.last_name) return a.last_name.localeCompare(b.last_name);
        return a.first_name.localeCompare(b.first_name);
      });

      setAllRecords(records);
      setLastRefresh(new Date());
      setLoading(false);
    }, (error) => {
      console.error('Firestore listener error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDay, config]);

  // Debounced roster-wide search (≥2 chars, 250ms)
  useEffect(() => {
    const q = studentFilter.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearchTruncated(false);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const handle = setTimeout(async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/students/search?q=${encodeURIComponent(q)}&limit=50`,
          { headers }
        );
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = (await res.json()) as {
          results: SearchResult[];
          total: number;
          truncated: boolean;
        };
        if (cancelled) return;
        setSearchResults(data.results);
        setSearchTruncated(Boolean(data.truncated));
      } catch (err) {
        if (!cancelled) {
          console.error('Student search error:', err);
          setSearchResults([]);
          setSearchTruncated(false);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [studentFilter, getAuthHeaders]);

  // Patch local records when the modal edits a student so rolled-off
  // absences reflect immediately without waiting for a listener tick.
  const handleStudentUpdate = useCallback((updated: Student) => {
    setAllRecords((prev) =>
      prev.map((r) =>
        r.student_id === updated.id
          ? {
              ...r,
              first_name: updated.first_name ?? r.first_name,
              last_name: updated.last_name ?? r.last_name,
              instrument: updated.instrument ?? r.instrument,
              ensemble: updated.ensemble ?? r.ensemble,
              dorm_building: updated.dorm_building ?? r.dorm_building,
              dorm_room: updated.dorm_room ?? r.dorm_room,
              cell_phone: updated.cell_phone ?? r.cell_phone,
              email: updated.email ?? r.email,
              parent_first_name: updated.parent_first_name ?? r.parent_first_name,
              parent_last_name: updated.parent_last_name ?? r.parent_last_name,
              parent_phone: updated.parent_phone ?? r.parent_phone,
            }
          : r
      )
    );
  }, []);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Compute stats from the actual records (respects period filter)
  const periodFiltered = selectedPeriod !== null
    ? allRecords.filter(r => r.period_number === selectedPeriod)
    : allRecords;

  const absentCount = periodFiltered.filter(r => r.status === 'absent').length;
  const tardyCount = periodFiltered.filter(r => r.status === 'tardy').length;

  // Apply all filters
  const filtered = periodFiltered.filter((record) => {
    if (statusFilter && record.status !== statusFilter) return false;
    if (studentFilter && !`${record.first_name} ${record.last_name}`.toLowerCase().includes(studentFilter.toLowerCase())) return false;
    if (ensembleFilter && record.ensemble !== ensembleFilter) return false;
    if (instrumentFilter && record.instrument !== instrumentFilter) return false;
    if (dormFilter && (record.dorm_building || '') !== dormFilter) return false;
    return true;
  });

  // Distinct instrument / dorm options derived from the current day's records
  const instrumentOptions = Array.from(
    new Set(allRecords.map((r) => r.instrument).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const dormOptions = Array.from(
    new Set(
      allRecords
        .map((r) => r.dorm_building)
        .filter((v): v is string => Boolean(v) && v !== 'n/a')
    )
  ).sort((a, b) => a.localeCompare(b));

  // Date the modal reports against — mirrors the selected day. Falls back to
  // today when config hasn't resolved yet.
  const dashboardDate =
    (config && selectedDay ? dayKeyToDate(selectedDay, config.day_dates) : null) ??
    getTodayDate();

  // Group by session, sorted by period then session name
  const sessionMap = new Map<string, SessionGroup>();

  for (const record of filtered) {
    const key = `${record.period_number}-${record.session_id}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        session_name: record.session_name,
        session_id: record.session_id,
        period_number: record.period_number,
        period_name: record.period_name,
        teacher_name: record.teacher_name,
        students: [],
      });
    }
    sessionMap.get(key)!.students.push(record);
  }

  const sortedGroups = Array.from(sessionMap.values()).sort((a, b) => {
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    return a.session_name.localeCompare(b.session_name);
  });

  // Sort students within each group by last name
  for (const group of sortedGroups) {
    group.students.sort((a, b) => a.last_name.localeCompare(b.last_name));
  }

  function exportCSV() {
    const headers = ['Name', 'Status', 'Session', 'Period', 'Ensemble', 'Instrument', 'Dorm', 'Cell', 'Parent Phone', 'Teacher'];
    const rows = filtered.map((r) => [
      `${r.first_name} ${r.last_name}`,
      r.status,
      r.session_name,
      r.period_name,
      r.ensemble,
      r.instrument,
      r.dorm_building || '',
      r.cell_phone || '',
      r.parent_phone || '',
      r.teacher_name,
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach((row) => {
      csv += row.map((cell) => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${statusFilter || 'absences'}-${selectedDay}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-2">
            <Link href="/" className="text-sm opacity-75 hover:opacity-100">
              &larr; Home
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-xs opacity-60">
                Live &bull; {lastRefresh.toLocaleTimeString()}
              </span>
              <button
                onClick={() => signOut()}
                className="text-xs opacity-75 hover:opacity-100 underline"
              >
                Sign Out
              </button>
            </div>
          </div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        {/* Day Selector */}
        <div className="flex gap-2 mb-3">
          {config && Object.keys(config.day_dates).map((dayKey) => {
            const isToday = dayKey === todayKey;
            const isSelected = dayKey === selectedDay;
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDay(dayKey)}
                aria-pressed={isSelected}
                aria-label={`${formatDayLabel(dayKey)}${isToday ? ' (today)' : ''}`}
                className={`flex-1 py-3 rounded-lg font-bold text-lg relative transition-all ${
                  isSelected
                    ? 'bg-camp-green text-white shadow-md'
                    : 'bg-white text-camp-green border-2 border-camp-green hover:bg-green-50'
                }`}
              >
                {dayKey}
                {isToday && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 bg-camp-accent text-white text-[10px] px-1.5 py-0.5 rounded-full"
                  >
                    today
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Period Selector */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedPeriod(null)}
            className={`px-3 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-all ${
              selectedPeriod === null
                ? 'bg-camp-accent text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All Periods
          </button>
          {PERIODS.map((p) => (
            <button
              key={p.num}
              onClick={() => setSelectedPeriod(selectedPeriod === p.num ? null : p.num)}
              className={`px-3 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-all ${
                selectedPeriod === p.num
                  ? 'bg-camp-accent text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Absent / Tardy Toggle */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setStatusFilter(statusFilter === 'absent' ? '' : 'absent')}
            className={`flex-1 py-4 rounded-lg font-bold text-center transition-all ${
              statusFilter === 'absent'
                ? 'bg-red-600 text-white shadow-md ring-2 ring-red-400'
                : 'bg-white text-red-600 border-2 border-red-300 hover:bg-red-50'
            }`}
          >
            <div className="text-3xl">{absentCount}</div>
            <div className="text-sm">Absent</div>
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'tardy' ? '' : 'tardy')}
            className={`flex-1 py-4 rounded-lg font-bold text-center transition-all ${
              statusFilter === 'tardy'
                ? 'bg-yellow-500 text-white shadow-md ring-2 ring-yellow-400'
                : 'bg-white text-yellow-600 border-2 border-yellow-300 hover:bg-yellow-50'
            }`}
          >
            <div className="text-3xl">{tardyCount}</div>
            <div className="text-sm">Tardy</div>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search any student (name, instrument)…"
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="camp-input w-full"
              role="combobox"
              aria-expanded={searchResults !== null}
              aria-controls="student-search-results"
              aria-autocomplete="list"
            />
            {searchResults !== null && (
              <div
                id="student-search-results"
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-30 max-h-80 overflow-y-auto"
              >
                {searchLoading && (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
                )}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No students match.</div>
                )}
                {searchResults.map((r) => {
                  const dorm = r.dorm_building && r.dorm_building !== 'n/a'
                    ? `${r.dorm_building}${r.dorm_room && r.dorm_room !== 'n/a' ? ` ${r.dorm_room}` : ''}`
                    : 'Commuter';
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setDetailStudentId(r.id);
                        setSearchResults(null);
                        setSearchTruncated(false);
                        setStudentFilter('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0"
                    >
                      <div className="text-sm font-semibold text-gray-900">
                        {r.first_name}
                        {r.preferred_name ? ` (${r.preferred_name})` : ''} {r.last_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.instrument}
                        {r.ensemble ? ` · ${r.ensemble}` : ''}
                        {` · ${dorm}`}
                      </div>
                    </button>
                  );
                })}
                {searchTruncated && !searchLoading && searchResults.length > 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500 italic border-t border-gray-100">
                    Showing first 50 matches — refine your search
                  </div>
                )}
              </div>
            )}
          </div>
          <select
            value={ensembleFilter}
            onChange={(e) => setEnsembleFilter(e.target.value)}
            className="camp-input w-40"
            aria-label="Filter by ensemble"
          >
            <option value="">All Ensembles</option>
            {['Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5', 'Band 6', 'Band 7', 'Orchestra 1', 'Orchestra 2'].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="camp-input w-40"
            aria-label="Filter by instrument"
          >
            <option value="">All Instruments</option>
            {instrumentOptions.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <select
            value={dormFilter}
            onChange={(e) => setDormFilter(e.target.value)}
            className="camp-input w-40"
            aria-label="Filter by dorm building"
          >
            <option value="">All Dorms</option>
            {dormOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button onClick={exportCSV} className="camp-btn-accent px-4 text-sm whitespace-nowrap">
            Export
          </button>
        </div>

        {/* Active Filters Summary */}
        <div className="text-sm text-gray-500 mb-4">
          {selectedDay ? formatDayLabel(selectedDay) : ''}
          {selectedPeriod !== null && ` \u2022 ${PERIODS.find(p => p.num === selectedPeriod)?.label}`}
          {statusFilter && ` \u2022 ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`}
          {ensembleFilter && ` \u2022 ${ensembleFilter}`}
          {instrumentFilter && ` \u2022 ${instrumentFilter}`}
          {dormFilter && ` \u2022 ${dormFilter}`}
          {studentFilter && ` \u2022 "${studentFilter}"`}
          {` \u2014 ${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
        </div>

        {/* Results: Grouped by Session */}
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : sortedGroups.length === 0 ? (
          <div className="camp-card p-8 text-center text-gray-500">
            {allRecords.length === 0
              ? 'No attendance data for this day yet'
              : 'No records match your filters'}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedGroups.map((group) => (
              <div key={`${group.period_number}-${group.session_id}`} className="camp-card overflow-hidden">
                {/* Session Header */}
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-camp-green">{group.session_name}</span>
                      <span className="text-gray-500 text-sm ml-2">
                        {group.period_name} &bull; {group.teacher_name}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      statusFilter === 'tardy' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {group.students.length} {statusFilter || 'absent/tardy'}
                    </span>
                  </div>
                </div>

                {/* Student List */}
                <div className="divide-y divide-gray-100">
                  {group.students.map((record) => {
                    const rowKey = `${record.student_id}-${record.session_id}`;
                    return (
                      <button
                        key={rowKey}
                        onClick={() => setDetailStudentId(record.student_id)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-semibold">{record.first_name} {record.last_name}</span>
                            <span className="text-gray-500 text-sm ml-2">{record.instrument}</span>
                            {record.ensemble && (
                              <span className="text-gray-400 text-sm ml-1">({record.ensemble})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              record.status === 'absent' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {record.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <Link href="/admin/data/students" className="camp-btn-outline block text-center py-3 font-semibold">
            Students
          </Link>
          <Link href="/admin/data/faculty" className="camp-btn-outline block text-center py-3 font-semibold">
            Faculty
          </Link>
          <Link href="/admin/data/sessions" className="camp-btn-outline block text-center py-3 font-semibold">
            Sessions
          </Link>
          <Link href="/admin/import" className="camp-btn-outline block text-center py-3 font-semibold">
            Import Data
          </Link>
          <Link href="/admin/settings" className="camp-btn-outline block text-center py-3 font-semibold">
            Settings
          </Link>
        </div>
      </div>

      <StudentDetailModal
        studentId={detailStudentId}
        date={dashboardDate}
        onClose={() => setDetailStudentId(null)}
        onUpdate={handleStudentUpdate}
      />
    </div>
  );
}
