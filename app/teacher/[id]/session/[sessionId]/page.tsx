'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Attendance } from '@/lib/types';
import { SessionStudentDenormalized } from '@/lib/types';
import { getCampCode, getCampCodeHeaders } from '@/lib/camp-code';

const DAYS = [
  { key: 'M', label: 'Mon' },
  { key: 'T', label: 'Tue' },
  { key: 'W', label: 'Wed' },
  { key: 'Th', label: 'Thu' },
  { key: 'F', label: 'Fri' },
  { key: 'S', label: 'Sat' },
];

function dayKeyToDate(dayKey: string): string {
  const map: Record<string, string> = {
    M: '2026-06-08',
    T: '2026-06-09',
    W: '2026-06-10',
    Th: '2026-06-11',
    F: '2026-06-12',
    S: '2026-06-13',
  };
  return map[dayKey] || '2026-06-08';
}

interface SessionInfo {
  id: string;
  name: string;
  type: string;
  location?: string;
  period_name: string;
  start_time: string;
  end_time: string;
  ensemble?: string;
}

export default function AttendancePage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dayParam = searchParams.get('day') || 'M';

  const [selectedDay, setSelectedDay] = useState(dayParam);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [students, setStudents] = useState<SessionStudentDenormalized[]>([]);
  const [attendance, setAttendance] = useState<Map<string, 'present' | 'absent' | 'tardy' | 'unmarked'>>(new Map());
  const [loading, setLoading] = useState(true);

  const date = dayKeyToDate(selectedDay);
  const headers = getCampCodeHeaders();

  useEffect(() => {
    if (!getCampCode()) {
      router.push('/');
      return;
    }
    fetchData();
  }, [selectedDay]);

  async function fetchData() {
    setLoading(true);
    try {
      const sessionId = params.sessionId;
      const d = dayKeyToDate(selectedDay);

      const [sessionDetailRes, studentsRes, attendanceRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`, { headers }),
        fetch(`/api/sessions/${sessionId}/students`, { headers }),
        fetch(`/api/attendance?session_id=${sessionId}&date=${d}`, { headers }),
      ]);

      if (!studentsRes.ok) {
        console.error('Failed to fetch session students');
        return;
      }

      const studentsData = await studentsRes.json() as SessionStudentDenormalized[];
      const attendanceData = await attendanceRes.json() as Attendance[];

      const attendanceMap = new Map<string, 'present' | 'absent' | 'tardy' | 'unmarked'>();
      for (const record of attendanceData) {
        attendanceMap.set(record.student_id, record.status);
      }

      setStudents(studentsData);
      setAttendance(attendanceMap);

      if (sessionDetailRes.ok) {
        const sessionData = await sessionDetailRes.json();
        setSession({
          id: sessionId,
          name: sessionData.name || 'Session',
          type: sessionData.type || 'rehearsal',
          location: sessionData.location,
          period_name: sessionData.period_name || 'Period',
          start_time: sessionData.start_time || '',
          end_time: sessionData.end_time || '',
          ensemble: sessionData.ensemble,
        });
      } else {
        setSession({
          id: sessionId,
          name: 'Session',
          type: 'rehearsal',
          period_name: 'Period',
          start_time: '',
          end_time: '',
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleAttendance(studentId: string) {
    const current = attendance.get(studentId) || 'unmarked';
    let next: 'present' | 'absent' | 'tardy' | 'unmarked';

    if (current === 'unmarked') {
      next = 'present';
    } else if (current === 'present') {
      next = 'absent';
    } else if (current === 'absent') {
      next = 'tardy';
    } else {
      next = 'unmarked';
    }

    const newMap = new Map(attendance);
    newMap.set(studentId, next);
    setAttendance(newMap);

    saveAttendance(studentId, next);
  }

  async function saveAttendance(studentId: string, status: 'present' | 'absent' | 'tardy' | 'unmarked') {
    try {
      if (status === 'unmarked') {
        return;
      }

      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          student_id: studentId,
          session_id: params.sessionId,
          date,
          status,
        }),
      });
    } catch (error) {
      console.error('Error marking attendance:', error);
    }
  }

  async function markAllRemaining() {
    const confirmed = confirm('Mark all remaining students as absent?');
    if (!confirmed) return;

    const newMap = new Map(attendance);
    for (const student of students) {
      const status = newMap.get(student.student_id);
      if (!status || status === 'unmarked') {
        newMap.set(student.student_id, 'absent');
        saveAttendance(student.student_id, 'absent');
      }
    }
    setAttendance(newMap);
  }

  const presentCount = Array.from(attendance.values()).filter(s => s === 'present').length;
  const absentCount = Array.from(attendance.values()).filter(s => s === 'absent').length;
  const tardyCount = Array.from(attendance.values()).filter(s => s === 'tardy').length;
  const unmarkedCount = students.length - presentCount - absentCount - tardyCount;

  // Sort by first_name since teachers only see first name + last initial
  const sortedStudents = [...students].sort((a, b) => {
    const nameA = (a.preferred_name || a.first_name).toLowerCase();
    const nameB = (b.preferred_name || b.first_name).toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return (a.last_initial || '').localeCompare(b.last_initial || '');
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky Header */}
      <div className="sticky-header">
        <Link href={`/teacher/${params.id}`} className="text-camp-green font-semibold hover:opacity-75 mb-2 block">
          &larr; Back
        </Link>
        <h1 className="camp-heading mb-0">{session?.name || 'Take Attendance'}</h1>
        <p className="text-sm text-gray-600 mb-3">
          {session?.period_name}{session?.start_time ? ` \u2022 ${session.start_time}\u2013${session.end_time}` : ''}
          {session?.location ? ` \u2022 ${session.location}` : ''}
        </p>

        {/* Day Selector */}
        <div className="flex gap-1 mb-3">
          {DAYS.map((day) => (
            <button
              key={day.key}
              onClick={() => setSelectedDay(day.key)}
              className={`flex-1 py-2 rounded font-bold text-sm transition-all ${
                selectedDay === day.key
                  ? 'bg-camp-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {day.key}
            </button>
          ))}
        </div>

        {/* Count Bar */}
        <div className="count-bar">
          <div className="count-item count-present">
            <div className="text-lg font-bold">{presentCount}</div>
            <div className="text-xs">Present</div>
          </div>
          <div className="count-item count-absent">
            <div className="text-lg font-bold">{absentCount}</div>
            <div className="text-xs">Absent</div>
          </div>
          <div className="count-item count-tardy">
            <div className="text-lg font-bold">{tardyCount}</div>
            <div className="text-xs">Tardy</div>
          </div>
          <div className="count-item count-unmarked">
            <div className="text-lg font-bold">{unmarkedCount}</div>
            <div className="text-xs">Unmarked</div>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="text-center text-gray-600 py-8">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="text-center text-gray-600 py-8">No students in this session</div>
        ) : (
          <div className="space-y-2">
            {sortedStudents.map((student) => {
              const status = attendance.get(student.student_id) || 'unmarked';
              const displayName = student.preferred_name || student.first_name;
              return (
                <button
                  key={student.student_id}
                  onClick={() => toggleAttendance(student.student_id)}
                  className={`w-full text-left p-3 rounded-lg transition-all attendance-toggle ${status}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold">
                        {displayName} {student.last_initial}.
                      </div>
                      <div className="text-sm opacity-75">
                        {student.instrument}
                        {student.dorm_room && student.dorm_room !== 'n/a' && ` \u2022 ${student.dorm_room}`}
                      </div>
                    </div>
                    <div className="text-lg font-bold">
                      {status === 'present' && 'P'}
                      {status === 'absent' && 'A'}
                      {status === 'tardy' && 'T'}
                      {status === 'unmarked' && '\u2013'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Mark All Remaining Button */}
        {unmarkedCount > 0 && (
          <button
            onClick={markAllRemaining}
            className="w-full mt-6 camp-btn-outline py-3 text-lg font-bold"
          >
            Mark {unmarkedCount} Remaining as Absent
          </button>
        )}
      </div>
    </div>
  );
}
