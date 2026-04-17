'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Attendance } from '@/lib/types';
import { SessionStudentDenormalized } from '@/lib/types';
import { getCampCode, getCampCodeHeaders } from '@/lib/camp-code';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate } from '@/lib/date';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import {
  enqueue,
  flush,
  size as queueSize,
  AttendanceQueueItem,
} from '@/lib/attendance-queue';

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

// Server still accepts 'tardy'; admin UI can still set it. Teacher client
// only cycles between unmarked ↔ present ↔ absent.
type ClientStatus = 'unmarked' | 'present' | 'absent' | 'tardy';

export default function AttendancePage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dayParam = searchParams.get('day');
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();
  const { push } = useToast();

  const [selectedDay, setSelectedDay] = useState<string | null>(dayParam);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [students, setStudents] = useState<SessionStudentDenormalized[]>([]);
  const [attendance, setAttendance] = useState<Map<string, ClientStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const date =
    config && selectedDay ? dayKeyToDate(selectedDay, config.day_dates) : null;
  const headers = getCampCodeHeaders();

  function refreshPendingCount() {
    setPendingCount(queueSize());
  }

  // Default selection to the URL day, else today, else the first camp day.
  useEffect(() => {
    if (config && selectedDay === null) {
      const firstDay = Object.keys(config.day_dates)[0] ?? 'M';
      setSelectedDay(todayKey ?? firstDay);
    }
  }, [config, todayKey, selectedDay]);

  useEffect(() => {
    if (!getCampCode()) {
      router.push('/');
      return;
    }
    if (config && selectedDay && date) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, config]);

  // Network send for POST (present/absent/tardy). Queue items carry this
  // shape, so the same helper is used for live writes and queue flush.
  const send = useCallback(
    async (item: AttendanceQueueItem): Promise<boolean> => {
      try {
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getCampCodeHeaders() },
          body: JSON.stringify({
            student_id: item.student_id,
            session_id: item.session_id,
            date: item.date,
            status: item.status,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  // DELETE helper for the unmark path. Not queued: unmark offline is a no-op
  // locally (user can retry when connectivity returns).
  const sendUnmark = useCallback(
    async (student_id: string, session_id: string, date: string): Promise<boolean> => {
      try {
        const url =
          `/api/attendance?student_id=${encodeURIComponent(student_id)}` +
          `&session_id=${encodeURIComponent(session_id)}` +
          `&date=${encodeURIComponent(date)}`;
        const res = await fetch(url, { method: 'DELETE', headers: getCampCodeHeaders() });
        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  const drainQueue = useCallback(async () => {
    const before = queueSize();
    if (before === 0) return;
    await flush(send);
    const drained = before - queueSize();
    refreshPendingCount();
    if (drained > 0) {
      push({ kind: 'success', text: `Synced ${drained} pending` });
    }
  }, [send, push]);

  // On mount: if we're online with a non-empty queue, drain it.
  useEffect(() => {
    refreshPendingCount();
    if (typeof navigator !== 'undefined' && navigator.onLine && queueSize() > 0) {
      drainQueue();
    }
  }, [drainQueue]);

  // Flush on transition back online.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => { drainQueue(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drainQueue]);

  async function fetchData() {
    if (!date) return;
    setLoading(true);
    try {
      const sessionId = params.sessionId;

      const [sessionDetailRes, studentsRes, attendanceRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`, { headers }),
        fetch(`/api/sessions/${sessionId}/students`, { headers }),
        fetch(`/api/attendance?session_id=${sessionId}&date=${date}`, { headers }),
      ]);

      if (!studentsRes.ok) {
        console.error('Failed to fetch session students');
        return;
      }

      const studentsData = await studentsRes.json() as SessionStudentDenormalized[];
      const attendanceData = await attendanceRes.json() as Attendance[];

      const attendanceMap = new Map<string, ClientStatus>();
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
    // 2-state client cycle: unmarked → present → absent → unmarked.
    // If the record is somehow 'tardy' (admin-set), next-tap clears it.
    let next: ClientStatus;
    if (current === 'unmarked') next = 'present';
    else if (current === 'present') next = 'absent';
    else next = 'unmarked'; // absent or tardy → unmarked

    // Optimistic local update
    const newMap = new Map(attendance);
    if (next === 'unmarked') newMap.delete(studentId);
    else newMap.set(studentId, next);
    setAttendance(newMap);

    saveAttendance(studentId, next);
  }

  async function saveAttendance(studentId: string, status: ClientStatus) {
    if (!date) return;

    let ok: boolean;
    if (status === 'unmarked') {
      ok = await sendUnmark(studentId, params.sessionId, date);
    } else if (status === 'tardy') {
      // Shouldn't happen from the client cycle, but gate anyway.
      ok = true;
    } else {
      ok = await send({
        student_id: studentId,
        session_id: params.sessionId,
        date,
        status,
        queuedAt: Date.now(),
      });
    }

    if (!ok) {
      // Queue everything that's retryable. 'unmarked' DELETE isn't in the
      // queue's status union — treat offline-unmark as a no-op locally
      // (user can re-tap later) but still toast so they know.
      if (status === 'present' || status === 'absent') {
        enqueue({
          student_id: studentId,
          session_id: params.sessionId,
          date,
          status,
          queuedAt: Date.now(),
        });
        refreshPendingCount();
      }
      push({ kind: 'error', text: 'Offline — saved to retry queue' });
    }
  }

  async function confirmMarkAllRemaining() {
    setConfirmOpen(false);
    if (!date) return;

    const items: AttendanceQueueItem[] = [];
    for (const student of students) {
      const status = attendance.get(student.student_id);
      if (!status || status === 'unmarked') {
        items.push({
          student_id: student.student_id,
          session_id: params.sessionId,
          date,
          status: 'absent',
          queuedAt: Date.now(),
        });
      }
    }

    if (items.length === 0) return;

    // Optimistic local update
    const newMap = new Map(attendance);
    for (const it of items) newMap.set(it.student_id, 'absent');
    setAttendance(newMap);

    try {
      const res = await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCampCodeHeaders() },
        body: JSON.stringify({
          items: items.map(({ student_id, session_id, date, status }) => ({
            student_id,
            session_id,
            date,
            status,
          })),
        }),
      });
      if (res.ok) {
        push({ kind: 'success', text: `Marked ${items.length} absent` });
      } else {
        for (const it of items) enqueue(it);
        refreshPendingCount();
        push({ kind: 'error', text: 'Offline — saved to retry queue' });
      }
    } catch {
      for (const it of items) enqueue(it);
      refreshPendingCount();
      push({ kind: 'error', text: 'Offline — saved to retry queue' });
    }
  }

  const presentCount = Array.from(attendance.values()).filter(s => s === 'present').length;
  const absentCount = Array.from(attendance.values()).filter(s => s === 'absent').length;
  const unmarkedCount =
    students.length - Array.from(attendance.values()).filter(
      s => s === 'present' || s === 'absent' || s === 'tardy'
    ).length;

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
        <div className="flex items-start justify-between gap-2">
          <h1 className="camp-heading mb-0">{session?.name || 'Take Attendance'}</h1>
          {pendingCount > 0 && (
            <span role="status" className="pending-badge">
              {pendingCount} pending sync
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-3">
          {session?.period_name}{session?.start_time ? ` \u2022 ${session.start_time}\u2013${session.end_time}` : ''}
          {session?.location ? ` \u2022 ${session.location}` : ''}
        </p>

        {/* Day Selector */}
        <div className="flex gap-1 mb-3">
          {config && Object.keys(config.day_dates).map((dayKey) => {
            const isToday = dayKey === todayKey;
            const isSelected = dayKey === selectedDay;
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDay(dayKey)}
                aria-pressed={isSelected}
                className={`flex-1 py-2 rounded font-bold text-sm transition-all relative ${
                  isSelected
                    ? 'bg-camp-green text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {dayKey}
                {isToday && !isSelected && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 w-2 h-2 bg-camp-accent rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Count Bar (3-column: Present / Absent / Unmarked) */}
        <div className="count-bar">
          <div className="count-item count-present">
            <div className="text-lg font-bold">{presentCount}</div>
            <div className="text-xs">Present</div>
          </div>
          <div className="count-item count-absent">
            <div className="text-lg font-bold">{absentCount}</div>
            <div className="text-xs">Absent</div>
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
              const status: ClientStatus = attendance.get(student.student_id) || 'unmarked';
              const displayName = student.preferred_name || student.first_name;
              const ariaLabel =
                `${displayName} ${student.last_initial}., ${student.instrument}, ${status}`;
              const isPressed = status === 'present' || status === 'absent' || status === 'tardy';
              return (
                <button
                  key={student.student_id}
                  onClick={() => toggleAttendance(student.student_id)}
                  aria-pressed={isPressed}
                  aria-label={ariaLabel}
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
                    <div className="text-lg font-bold" aria-hidden="true">
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
      </div>

      {/* Sticky Bottom CTA */}
      {unmarkedCount > 0 && (
        <div className="sticky-bottom-cta">
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full camp-btn-outline py-3 text-lg font-bold"
          >
            Mark {unmarkedCount} Remaining Absent
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Mark remaining absent?"
        size="md"
      >
        <p className="mb-4 text-gray-700">
          Mark {unmarkedCount} student{unmarkedCount === 1 ? '' : 's'} remaining as absent?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="camp-btn-outline px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmMarkAllRemaining}
            className="camp-btn px-4 py-2"
          >
            Mark Absent
          </button>
        </div>
      </Modal>
    </div>
  );
}
