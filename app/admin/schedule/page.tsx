'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface ScheduleItem {
  id?: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  session_id?: string;
  session_name?: string;
  name?: string;
  type?: string;
  location?: string;
  ensemble?: string;
  instrument?: string;
  faculty_name?: string;
  student_count?: number;
}

// Canonical ensemble column order. Any ensemble not in this list is appended
// alphabetically so unexpected data still shows up.
const ENSEMBLE_ORDER = [
  'Band 1',
  'Band 2',
  'Band 3',
  'Band 4',
  'Band 5',
  'Band 6',
  'Band 7',
  'Orchestra 1',
  'Orchestra 2',
];

const SHARED_COLUMN = 'Shared';

// Per-ensemble header tints. Cell backgrounds stay white so session text reads
// clearly; the tint is concentrated in the column header.
function ensembleHeaderClass(ensemble: string): string {
  if (ensemble === SHARED_COLUMN) return 'bg-amber-100 text-amber-900';
  if (ensemble.startsWith('Orchestra')) {
    const n = Number(ensemble.split(' ')[1] ?? '1');
    return n <= 1 ? 'bg-blue-100 text-blue-900' : 'bg-blue-200 text-blue-900';
  }
  if (ensemble.startsWith('Band')) {
    const n = Number(ensemble.split(' ')[1] ?? '1');
    // Band 1 = green (top), shading toward zinc/slate for Band 7
    const shades = [
      'bg-emerald-100 text-emerald-900', // Band 1
      'bg-emerald-50 text-emerald-900',  // Band 2
      'bg-lime-50 text-lime-900',        // Band 3
      'bg-yellow-50 text-yellow-900',    // Band 4
      'bg-stone-100 text-stone-800',     // Band 5
      'bg-zinc-100 text-zinc-800',       // Band 6
      'bg-slate-200 text-slate-800',     // Band 7
    ];
    return shades[Math.max(0, Math.min(shades.length - 1, n - 1))];
  }
  return 'bg-gray-100 text-gray-800';
}

function ensembleCellClass(ensemble: string): string {
  // Very light tint so stacked rows still read as a column.
  if (ensemble === SHARED_COLUMN) return 'bg-amber-50/40';
  if (ensemble.startsWith('Orchestra')) return 'bg-blue-50/40';
  if (ensemble.startsWith('Band')) {
    const n = Number(ensemble.split(' ')[1] ?? '1');
    const shades = [
      'bg-emerald-50/40',
      'bg-emerald-50/30',
      'bg-lime-50/30',
      'bg-yellow-50/30',
      'bg-stone-50/40',
      'bg-zinc-50/40',
      'bg-slate-100/40',
    ];
    return shades[Math.max(0, Math.min(shades.length - 1, n - 1))];
  }
  return '';
}

interface SessionCellProps {
  sessions: ScheduleItem[];
}

function SessionCell({ sessions }: SessionCellProps) {
  if (sessions.length === 0) {
    return <span className="text-gray-300 select-none">—</span>;
  }

  return (
    <div className="flex flex-col divide-y divide-gray-200">
      {sessions.map((s, idx) => {
        const name = s.session_name || s.name || 'Session';
        const location = s.location || '';
        const teacher = s.faculty_name || '';
        const ariaParts = [name];
        if (location) ariaParts.push(`in ${location}`);
        if (teacher && teacher !== 'TBA') ariaParts.push(`taught by ${teacher}`);
        const tooltip = `${name}${location ? ` — ${location}` : ''}${teacher ? ` — ${teacher}` : ''}`;

        return (
          <Link
            key={s.session_id ?? s.id ?? idx}
            href={`/admin/data/sessions?q=${encodeURIComponent(name)}`}
            aria-label={ariaParts.join(' ')}
            title={tooltip}
            className={`block px-2 py-1.5 hover:bg-white/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-camp-green ${
              idx > 0 ? 'pt-2' : ''
            }`}
          >
            <div className="font-semibold text-gray-900 text-xs leading-tight truncate">
              {name}
            </div>
            {location && (
              <div className="text-[11px] text-gray-600 truncate">{location}</div>
            )}
            {teacher && (
              <div className="text-[11px] text-gray-500 truncate italic">
                {teacher}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default function SchedulePage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function fetchSchedule() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/schedule', { headers });
      const data = await res.json();
      setSchedule(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  // Derive period list (unique, ordered by period_number)
  const periods = useMemo(() => {
    const map = new Map<number, { number: number; name: string; time: string }>();
    for (const s of schedule) {
      if (!map.has(s.period_number)) {
        map.set(s.period_number, {
          number: s.period_number,
          name: s.period_name,
          time:
            s.start_time && s.end_time
              ? `${s.start_time}–${s.end_time}`
              : '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.number - b.number);
  }, [schedule]);

  // Derive ensemble columns: canonical order first, then any extras,
  // always append Shared column if any session lacks an ensemble.
  const ensembleColumns = useMemo(() => {
    const present = new Set<string>();
    let hasShared = false;
    for (const s of schedule) {
      if (s.ensemble) present.add(s.ensemble);
      else hasShared = true;
    }
    const ordered: string[] = [];
    for (const e of ENSEMBLE_ORDER) {
      if (present.has(e)) {
        ordered.push(e);
        present.delete(e);
      }
    }
    // Any unknown ensembles, alphabetized
    const extras = Array.from(present).sort();
    ordered.push(...extras);
    if (hasShared) ordered.push(SHARED_COLUMN);
    return ordered;
  }, [schedule]);

  // Build matrix: key = `${period_number}:::${ensemble}` → ScheduleItem[]
  const matrix = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const s of schedule) {
      const col = s.ensemble || SHARED_COLUMN;
      const key = `${s.period_number}:::${col}`;
      const list = m.get(key) ?? [];
      list.push(s);
      m.set(key, list);
    }
    return m;
  }, [schedule]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link
          href="/admin/dashboard"
          className="text-sm opacity-75 hover:opacity-100 mb-2 block"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Schedule Grid</h1>
        <p className="text-sm opacity-80 mt-1">
          Periods × ensembles. Click a session to view its roster.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto p-4">
        {loading ? (
          <div className="text-center text-gray-600 py-8">Loading...</div>
        ) : schedule.length === 0 ? (
          <div className="camp-card text-center text-gray-600 py-8">
            No sessions scheduled yet.
          </div>
        ) : (
          <div className="camp-card overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-20 bg-gray-100 border border-gray-300 px-3 py-2 text-left font-bold w-40"
                  >
                    Period
                  </th>
                  {ensembleColumns.map((ens) => (
                    <th
                      key={ens}
                      scope="col"
                      className={`border border-gray-300 px-3 py-2 text-left font-bold text-xs whitespace-nowrap ${ensembleHeaderClass(
                        ens
                      )}`}
                    >
                      {ens}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.number} className="align-top">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-gray-50 border border-gray-300 px-3 py-2 text-left font-bold w-40"
                    >
                      <div className="text-gray-900">{period.name}</div>
                      {period.time && (
                        <div className="text-xs font-normal text-gray-500 mt-0.5">
                          {period.time}
                        </div>
                      )}
                    </th>
                    {ensembleColumns.map((ens) => {
                      const cellSessions =
                        matrix.get(`${period.number}:::${ens}`) ?? [];
                      return (
                        <td
                          key={ens}
                          className={`border border-gray-300 p-0 align-top min-w-[140px] ${ensembleCellClass(
                            ens
                          )}`}
                        >
                          <SessionCell sessions={cellSessions} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
