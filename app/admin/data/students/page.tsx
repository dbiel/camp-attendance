'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Student } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

export default function StudentsDataPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Student>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) fetchStudents();
  }, [user, authLoading]);

  async function fetchStudents() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/students', { headers });
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = students.filter((s) => {
    const query = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(query) ||
      s.last_name.toLowerCase().includes(query) ||
      s.instrument.toLowerCase().includes(query) ||
      s.ensemble.toLowerCase().includes(query)
    );
  });

  function startEdit(student: Student) {
    setEditingId(student.id);
    setEditData(student);
  }

  async function saveEdit() {
    if (editingId === null) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/students/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(editData),
      });

      const updated = students.map((s) => (s.id === editingId ? { ...s, ...editData } : s));
      setStudents(updated);
      setEditingId(null);
      setEditData({});
    } catch (error) {
      console.error('Error saving student:', error);
    }
  }

  async function deleteStudent(id: string) {
    if (!confirm('Delete this student?')) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/students/${id}`, { method: 'DELETE', headers });
      setStudents(students.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  }

  if (authLoading || !user) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link href="/admin/dashboard" className="text-sm opacity-75 hover:opacity-100 mb-2 block">
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Students</h1>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="camp-input"
          />
        </div>

        {loading ? (
          <div className="text-center text-gray-600 py-8">Loading...</div>
        ) : (
          <div className="camp-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Instrument</th>
                  <th className="px-4 py-2 text-left">Ensemble</th>
                  <th className="px-4 py-2 text-left">Division</th>
                  <th className="px-4 py-2 text-left">Dorm</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => (
                  <tr key={student.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold">{student.first_name} {student.last_name}</td>
                    <td className="px-4 py-2">{student.instrument}</td>
                    <td className="px-4 py-2">{student.ensemble}</td>
                    <td className="px-4 py-2">{student.division}</td>
                    <td className="px-4 py-2 text-gray-600">{student.dorm_room || '-'}</td>
                    <td className="px-4 py-2 space-x-2">
                      <button
                        onClick={() => startEdit(student)}
                        className="text-camp-green hover:opacity-75 font-semibold text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteStudent(student.id)}
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

      {/* Edit Modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-96 overflow-y-auto">
            <h2 className="text-xl font-bold text-camp-green mb-4">Edit Student</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
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
                <label className="camp-label">Instrument</label>
                <input
                  type="text"
                  value={editData.instrument || ''}
                  onChange={(e) => setEditData({ ...editData, instrument: e.target.value })}
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
                <label className="camp-label">Division</label>
                <select
                  value={editData.division || ''}
                  onChange={(e) => setEditData({ ...editData, division: e.target.value })}
                  className="camp-input"
                >
                  <option>Commuter</option>
                  <option>Overnight</option>
                </select>
              </div>
              <div>
                <label className="camp-label">Dorm Room</label>
                <input
                  type="text"
                  value={editData.dorm_room || ''}
                  onChange={(e) => setEditData({ ...editData, dorm_room: e.target.value })}
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
