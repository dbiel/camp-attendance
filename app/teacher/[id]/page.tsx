'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Faculty } from '@/lib/types';
import { getCampCode, getCampCodeHeaders, setTeacherFacultyId } from '@/lib/camp-code';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel } from '@/lib/date';

interface SessionInfo {
  id: string;
  name: string;
  type: string;
  location?: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  ensemble?: string;
  instrument?: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  tardy_count: number;
}

export default function TeacherDashboard({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getCampCode()) {
      router.push('/');
      return;
    }
    setTeacherFacultyId(params.id);
    fetchFaculty();
    updateCurrentPeriod();
    const interval = setInterval(updateCurrentPeriod, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Default selection to "today" once camp config loads.
  useEffect(() => {
    if (config && selectedDay === null) {
      const firstDay = Object.keys(config.day_dates)[0] ?? 'M';
      setSelectedDay(todayKey ?? firstDay);
    }
  }, [config, todayKey, selectedDay]);

  useEffect(() => {
    if (faculty && selectedDay && config) {
      fetchSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faculty, selectedDay, config]);

  function updateCurrentPeriod() {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    const allPeriods = [
      { number: 1, start: '08:00', end: '08:50' },
      { number: 2, start: '09:00', end: '09:50' },
      { number: 3, start: '10:00', end: '10:50' },
      { number: 4, start: '11:00', end: '11:50' },
      { number: 5, start: '12:00', end: '12:50' },
      { number: 6, start: '13:00', end: '13:50' },
      { number: 7, start: '14:00', end: '14:50' },
      { number: 8, start: '15:00', end: '15:50' },
      { number: 9, start: '16:00', end: '16:50' },
      { number: 10, start: '17:00', end: '18:00' },
    ];

    const current = allPeriods.find(p => currentTime >= p.start && currentTime < p.end);
    setCurrentPeriod(current?.number ?? null);
  }

  async function fetchFaculty() {
    try {
      const res = await fetch(`/api/faculty/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setFaculty(data);
      }
    } catch (error) {
      console.error('Error fetching faculty:', error);
    }
  }

  async function fetchSessions() {
    if (!config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/faculty/${params.id}/sessions?date=${date}`, {
        headers: getCampCodeHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  function getAttendancePercent(session: SessionInfo): number {
    const marked = session.present_count + session.absent_count + session.tardy_count;
    return session.total_students > 0 ? Math.round((marked / session.total_students) * 100) : 0;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link href="/" className="text-sm opacity-75 hover:opacity-100 mb-2 block">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-bold">
          {faculty ? `${faculty.first_name} ${faculty.last_name}` : 'Teacher Dashboard'}
        </h1>
        <p className="text-sm opacity-80">{faculty?.role}</p>
      </div>

      {/* Day Selector */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex gap-2 mb-4">
          {config && Object.keys(config.day_dates).map((dayKey) => {
            const isToday = dayKey === todayKey;
            const isSelected = dayKey === selectedDay;
            return (
              <button
                key={dayKey}
                onClick={() => { setLoading(true); setSelectedDay(dayKey); }}
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
      </div>

      {/* Current Period Indicator */}
      {currentPeriod !== null && (
        <div className="bg-camp-accent text-white p-3 text-center font-semibold">
          Current: Period {currentPeriod}
        </div>
      )}

      {/* Sessions List */}
      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="text-center text-gray-600 py-8">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-gray-600 py-8">No sessions assigned</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/teacher/${params.id}/session/${session.id}?day=${selectedDay}`}
                className={`block p-4 rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 ${
                  currentPeriod === session.period_number
                    ? 'bg-camp-accent text-white border-2 border-camp-accent'
                    : 'bg-white border border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className={`font-bold text-lg ${currentPeriod === session.period_number ? 'text-white' : 'text-camp-green'}`}>
                      {session.name}
                    </h3>
                    <p className={`text-sm ${currentPeriod === session.period_number ? 'text-white text-opacity-90' : 'text-gray-600'}`}>
                      {session.period_name} &bull; {session.start_time} - {session.end_time}
                    </p>
                  </div>
                  <div className={`text-right ${currentPeriod === session.period_number ? 'text-white' : 'text-gray-700'}`}>
                    <div className="text-2xl font-bold">{getAttendancePercent(session)}%</div>
                    <div className="text-xs">{session.present_count + session.absent_count + session.tardy_count}/{session.total_students}</div>
                  </div>
                </div>
                {session.location && (
                  <p className={`text-sm ${currentPeriod === session.period_number ? 'text-white text-opacity-90' : 'text-gray-500'}`}>
                    {session.location}
                  </p>
                )}
                <div className="flex gap-3 mt-3 text-xs font-semibold">
                  <span className={`px-2 py-1 rounded ${currentPeriod === session.period_number ? 'bg-white bg-opacity-20' : 'bg-green-100 text-green-800'}`}>
                    P {session.present_count}
                  </span>
                  <span className={`px-2 py-1 rounded ${currentPeriod === session.period_number ? 'bg-white bg-opacity-20' : 'bg-red-100 text-red-800'}`}>
                    A {session.absent_count}
                  </span>
                  <span className={`px-2 py-1 rounded ${currentPeriod === session.period_number ? 'bg-white bg-opacity-20' : 'bg-yellow-100 text-yellow-800'}`}>
                    T {session.tardy_count}
                  </span>
                  <span className={`px-2 py-1 rounded ${currentPeriod === session.period_number ? 'bg-white bg-opacity-20' : 'bg-gray-100 text-gray-800'}`}>
                    ? {session.total_students - (session.present_count + session.absent_count + session.tardy_count)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
