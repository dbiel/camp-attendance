'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Student } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import {
  DeleteStudentModal,
  EditMode,
  EditStudentModal,
  EMPTY_DRAFT,
  FieldErrors,
  StudentDraft,
  draftFromStudent,
  serializeDraft,
  validateDraft,
} from './EditStudentModal';

export default function StudentsDataPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { push } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit/Add modal state
  const [mode, setMode] = useState<EditMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudentDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // Delete confirm modal state
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/admin');
      return;
    }
    if (user) fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function fetchStudents() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/students', { headers });
      if (res.ok) {
        const data = (await res.json()) as Student[];
        setStudents(data);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.instrument.toLowerCase().includes(q) ||
        s.ensemble.toLowerCase().includes(q)
    );
  }, [students, search]);

  function openEdit(student: Student) {
    setMode('edit');
    setEditingId(student.id);
    setDraft(draftFromStudent(student));
    setErrors({});
  }

  function openAdd() {
    setMode('add');
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT });
    setErrors({});
  }

  function closeModal() {
    if (saving) return;
    setMode(null);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setErrors({});
  }

  async function handleSave() {
    const v = validateDraft(draft);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload = serializeDraft(draft);

      if (mode === 'edit' && editingId) {
        const res = await fetch(`/api/students/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setStudents((prev) =>
          prev.map((s) => (s.id === editingId ? ({ ...s, ...payload } as Student) : s))
        );
        push({ kind: 'success', text: 'Saved' });
        closeModal();
      } else if (mode === 'add') {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Create failed (${res.status})`);
        // Refresh the table so we pick up the new student (with its id + created_at)
        await fetchStudents();
        push({ kind: 'success', text: 'Saved' });
        closeModal();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      push({ kind: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/students/${deleteTarget.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setStudents((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      push({
        kind: 'success',
        text: `Deleted ${deleteTarget.first_name} ${deleteTarget.last_name}`,
      });
      setDeleteTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      push({ kind: 'error', text: msg });
    } finally {
      setDeleting(false);
    }
  }

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Students</h1>
          <button
            type="button"
            onClick={openAdd}
            className="bg-white text-camp-green font-semibold px-3 py-1.5 rounded hover:bg-gray-100 text-sm"
          >
            + Add Student
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="camp-input"
            aria-label="Search students"
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
                  <tr
                    key={student.id}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 font-semibold">
                      {student.first_name} {student.last_name}
                    </td>
                    <td className="px-4 py-2">{student.instrument}</td>
                    <td className="px-4 py-2">{student.ensemble}</td>
                    <td className="px-4 py-2">{student.division}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {student.dorm_room || '-'}
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      <button
                        onClick={() => openEdit(student)}
                        className="text-camp-green hover:opacity-75 font-semibold text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(student)}
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

      <EditStudentModal
        open={mode !== null}
        mode={mode ?? 'edit'}
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        saving={saving}
        onSave={handleSave}
        onClose={closeModal}
      />

      <DeleteStudentModal
        target={deleteTarget}
        deleting={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
