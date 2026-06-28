'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Faculty, FacultySessionRow } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

interface NowNext {
  current: string | null;
  room: string | null;
  next: string;
}

export default function FacultyDataPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Faculty>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Current/Next columns (one batch call) + lazily-loaded per-faculty schedule.
  const [nowNext, setNowNext] = useState<Record<string, NowNext>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionsByFaculty, setSessionsByFaculty] = useState<Record<string, FacultySessionRow[]>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) {
      fetchFaculty();
      fetchNowNext();
    }
  }, [user, authLoading]);

  async function fetchFaculty() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/faculty', { headers });
      if (!res.ok) {
        console.error('Failed to fetch faculty:', res.status);
        setFaculty([]);
        return;
      }
      const data = await res.json();
      setFaculty(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching faculty:', error);
      setFaculty([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNowNext() {
    try {
      const headers = await getAuthHeaders();
      // ?now=HH:MM (testing) overrides the clock for the Current/Next columns.
      const now = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('now') : null;
      const qs = now ? `?now=${encodeURIComponent(now)}` : '';
      const res = await fetch(`/api/faculty/now-next${qs}`, { headers });
      if (res.ok) setNowNext((await res.json()).byFaculty ?? {});
    } catch {
      // columns are a nicety — ignore transient failures
    }
  }

  async function toggleExpand(member: Faculty) {
    if (expandedId === member.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(member.id);
    if (!sessionsByFaculty[member.id]) {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/faculty/${member.id}/sessions`, { headers });
        if (res.ok) {
          const rows = (await res.json()) as FacultySessionRow[];
          setSessionsByFaculty((prev) => ({ ...prev, [member.id]: Array.isArray(rows) ? rows : [] }));
        }
      } catch {
        setSessionsByFaculty((prev) => ({ ...prev, [member.id]: [] }));
      }
    }
  }

  const filtered = faculty.filter((f) => {
    const query = search.toLowerCase();
    return (
      f.first_name.toLowerCase().includes(query) ||
      f.last_name.toLowerCase().includes(query) ||
      f.role.toLowerCase().includes(query)
    );
  });

  function startEdit(member: Faculty) {
    setEditingId(member.id);
    setEditData(member);
  }

  async function saveEdit() {
    if (editingId === null) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/faculty/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(editData),
      });

      const updated = faculty.map((f) => (f.id === editingId ? { ...f, ...editData } : f));
      setFaculty(updated);
      setEditingId(null);
      setEditData({});
    } catch (error) {
      console.error('Error saving faculty:', error);
    }
  }

  async function deleteFacultyMember(id: string) {
    if (!confirm('Delete this faculty member?')) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/faculty/${id}`, { method: 'DELETE', headers });
      setFaculty(faculty.filter((f) => f.id !== id));
    } catch (error) {
      console.error('Error deleting faculty:', error);
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center"><div className="text-[var(--text-2)]">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] pb-20">
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <h1 className="text-2xl font-bold text-camp-green">Faculty</h1>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search faculty..."
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
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Now (room)</th>
                  <th className="px-4 py-2 text-left">Next</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const nn = nowNext[member.id];
                  const expanded = expandedId === member.id;
                  const rows = sessionsByFaculty[member.id];
                  const nowLabel = nn
                    ? nn.current
                      ? `${nn.current}${nn.room ? ` · 📍${nn.room}` : ''}`
                      : 'No class'
                    : '—';
                  return (
                    <Fragment key={member.id}>
                      <tr className="border-b border-[var(--glass-border)] hover:bg-[var(--surface)]">
                        <td className="px-4 py-2 font-semibold">
                          <button onClick={() => toggleExpand(member)} className="text-left hover:text-camp-green">
                            {expanded ? '▾' : '▸'} {member.first_name} {member.last_name}
                          </button>
                        </td>
                        <td className="px-4 py-2">{member.role}</td>
                        <td className="px-4 py-2 text-[var(--text-2)]">{nowLabel}</td>
                        <td className="px-4 py-2 text-[var(--text-3)]">{nn ? nn.next : '—'}</td>
                        <td className="px-4 py-2 space-x-2">
                          <button
                            onClick={() => startEdit(member)}
                            className="text-camp-green hover:opacity-75 font-semibold text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteFacultyMember(member.id)}
                            className="text-red-600 hover:opacity-75 font-semibold text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-[var(--glass-border)] bg-[var(--surface)]">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="text-sm">
                                <h3 className="mb-1 font-semibold text-camp-green">Details</h3>
                                <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-[var(--text-2)]">
                                  <dt className="text-[var(--text-3)]">Role</dt><dd>{member.role || '—'}</dd>
                                  <dt className="text-[var(--text-3)]">Email</dt><dd className="break-all">{member.email || '—'}</dd>
                                </dl>
                              </div>
                              <div className="text-sm">
                                <h3 className="mb-1 font-semibold text-camp-green">Schedule &amp; rooms</h3>
                                {!rows && <p className="text-[var(--text-3)]">Loading…</p>}
                                {rows && rows.length === 0 && <p className="text-[var(--text-3)]">No assigned sessions.</p>}
                                {rows && rows.length > 0 && (
                                  <ul className="space-y-0.5 text-[var(--text-2)]">
                                    {rows.map((s) => (
                                      <li key={s.id}>
                                        <span className="text-[var(--text-3)]">
                                          P{s.period_number} {s.start_time}
                                          {s.end_time ? `–${s.end_time}` : ''}
                                        </span>{' '}
                                        · {s.name}
                                        <span className="text-[var(--text-3)]"> · 📍{s.location || 'no room'}</span>
                                        {s.ensemble ? <span className="text-[var(--text-3)]"> · {s.ensemble}</span> : ''}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="glass-card p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-camp-green mb-4">Edit Faculty</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="camp-label">First Name</label>
                <input
                  type="text"
                  value={editData.first_name || ''}
                  onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                  className="camp-input"
                />
              </div>
              <div>
                <label className="camp-label">Last Name</label>
                <input
                  type="text"
                  value={editData.last_name || ''}
                  onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                  className="camp-input"
                />
              </div>
              <div>
                <label className="camp-label">Role</label>
                <input
                  type="text"
                  value={editData.role || ''}
                  onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                  className="camp-input"
                />
              </div>
              <div>
                <label className="camp-label">Email</label>
                <input
                  type="email"
                  value={editData.email || ''}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
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
          </div>
        </div>
      )}
    </div>
  );
}
