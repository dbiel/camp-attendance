'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session, Period } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { MasterSchedule } from './MasterSchedule';
import { EnsembleAttendanceGrid } from './EnsembleAttendanceGrid';
import { Modal } from '@/components/Modal';

export default function SessionsDataPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Session>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'master' | 'records' | 'attendance'>('master');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) fetchData();
  }, [user, authLoading]);

  async function fetchData() {
    try {
      const headers = await getAuthHeaders();
      const [sessionsRes, periodsRes] = await Promise.all([
        fetch('/api/sessions', { headers }),
        fetch('/api/schedule', { headers }),
      ]);

      if (!sessionsRes.ok || !periodsRes.ok) {
        console.error('Failed to fetch sessions/schedule:', sessionsRes.status, periodsRes.status);
        setSessions([]);
        setPeriods([]);
        return;
      }

      const sessionsData = await sessionsRes.json();
      const scheduleData = await periodsRes.json();
      const sessionsArr = Array.isArray(sessionsData) ? sessionsData : [];
      const scheduleArr = Array.isArray(scheduleData) ? scheduleData : [];

      // Extract unique periods
      const periodsMap = new Map<number, Period>();
      scheduleArr.forEach((s: any) => {
        if (!periodsMap.has(s.period_number)) {
          periodsMap.set(s.period_number, {
            id: String(s.period_number),
            number: s.period_number,
            name: s.period_name,
            start_time: s.start_time,
            end_time: s.end_time,
          });
        }
      });
      const uniquePeriods: Period[] = Array.from(periodsMap.values());

      setSessions(sessionsArr);
      setPeriods(uniquePeriods);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = sessions.filter((s) => {
    const query = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      (s.ensemble && s.ensemble.toLowerCase().includes(query)) ||
      (s.instrument && s.instrument.toLowerCase().includes(query))
    );
  });

  function startEdit(session: Session) {
    setEditingId(session.id);
    setEditData(session);
  }

  async function saveEdit() {
    if (editingId === null) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/sessions/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(editData),
      });

      const updated = sessions.map((s) => (s.id === editingId ? { ...s, ...editData } : s));
      setSessions(updated);
      setEditingId(null);
      setEditData({});
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  async function deleteSessionItem(id: string) {
    if (!confirm('Delete this class?')) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/sessions/${id}`, { method: 'DELETE', headers });
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center"><div className="text-[var(--text-2)]">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] pb-20">
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <h1 className="text-2xl font-bold text-camp-green">Classes</h1>
        <div className="mt-2 flex w-max overflow-hidden rounded-[var(--radius-pill)] border border-[var(--glass-border)] text-sm">
          <button
            onClick={() => setView('master')}
            className={`px-3 py-1 ${view === 'master' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}
          >
            Master schedule
          </button>
          <button
            onClick={() => setView('records')}
            className={`px-3 py-1 ${view === 'records' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}
          >
            Class records
          </button>
          <button
            onClick={() => setView('attendance')}
            className={`px-3 py-1 ${view === 'attendance' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}
          >
            Ensemble attendance
          </button>
        </div>
      </div>

      {view === 'attendance' && (
        <div className="max-w-6xl mx-auto p-4">
          <EnsembleAttendanceGrid />
        </div>
      )}

      {view === 'master' && (
        <div className="max-w-6xl mx-auto p-4">
          <MasterSchedule />
        </div>
      )}

      {view === 'records' && (
      <div className="max-w-6xl mx-auto p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search classes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="camp-input"
          />
        </div>

        {loading ? (
          <div className="text-center text-[var(--text-2)] py-8">Loading...</div>
        ) : (
          <div className="camp-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--accent-soft)] border-b border-[var(--glass-border)]">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Period</th>
                  <th className="px-4 py-2 text-left">Location</th>
                  <th className="px-4 py-2 text-left">Ensemble</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => (
                  <tr key={session.id} className="border-b border-[var(--glass-border)] hover:bg-[var(--surface)]">
                    <td className="px-4 py-2 font-semibold">{session.name}</td>
                    <td className="px-4 py-2">{session.type}</td>
                    <td className="px-4 py-2">{session.period_id}</td>
                    <td className="px-4 py-2 text-[var(--text-2)]">{session.location || '-'}</td>
                    <td className="px-4 py-2">{session.ensemble || '-'}</td>
                    <td className="px-4 py-2 space-x-2">
                      <button
                        onClick={() => startEdit(session)}
                        className="text-camp-green hover:opacity-75 font-semibold text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSessionItem(session.id)}
                        className="text-red-600 hover:opacity-75 font-semibold text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Edit Modal — shared Modal: scrolls, and full-screen on mobile. */}
      <Modal
        open={editingId !== null}
        title="Edit Class"
        size="md"
        onClose={() => {
          setEditingId(null);
          setEditData({});
        }}
      >
        <div className="space-y-4 mb-6">
              <div>
                <label className="camp-label">Name</label>
                <input
                  type="text"
                  value={editData.name || ''}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="camp-input"
                />
              </div>
              <div>
                <label className="camp-label">Type</label>
                <select
                  value={editData.type || ''}
                  onChange={(e) => setEditData({ ...editData, type: e.target.value as any })}
                  className="camp-input"
                >
                  <option>rehearsal</option>
                  <option>sectional</option>
                  <option>masterclass</option>
                  <option>elective</option>
                  <option>assembly</option>
                  <option>lunch</option>
                </select>
              </div>
              <div>
                <label className="camp-label">Location</label>
                <input
                  type="text"
                  value={editData.location || ''}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  className="camp-input"
                />
              </div>
              <div>
                <label className="camp-label">Ensemble</label>
                <input
                  type="text"
                  value={editData.ensemble || ''}
                  onChange={(e) => setEditData({ ...editData, ensemble: e.target.value })}
                  className="camp-input"
                />
              </div>
              <div>
                <label className="camp-label">Instrument</label>
                <input
                  type="text"
                  value={editData.instrument || ''}
                  onChange={(e) => setEditData({ ...editData, instrument: e.target.value })}
                  className="camp-input"
                />
              </div>
            </div>
        <div className="flex gap-3">
          <button onClick={saveEdit} className="flex-1 camp-btn-primary py-2">
            Save
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setEditData({});
            }}
            className="flex-1 camp-btn-outline py-2"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
