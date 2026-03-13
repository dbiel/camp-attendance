'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Faculty } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

export default function FacultyDataPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Faculty>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) fetchFaculty();
  }, [user, authLoading]);

  async function fetchFaculty() {
    try {
      const res = await fetch('/api/faculty');
      const data = await res.json();
      setFaculty(data);
    } catch (error) {
      console.error('Error fetching faculty:', error);
    } finally {
      setLoading(false);
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
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link href="/admin/dashboard" className="text-sm opacity-75 hover:opacity-100 mb-2 block">
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Faculty</h1>
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
          <div className="text-center text-gray-600 py-8">Loading...</div>
        ) : (
          <div className="camp-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold">{member.first_name} {member.last_name}</td>
                    <td className="px-4 py-2">{member.role}</td>
                    <td className="px-4 py-2 text-gray-600">{member.email || '-'}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
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
