'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Student } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import type { StudentScheduleSlot } from '@/lib/firestore';
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

/** Collapse duplicate sessions (e.g. last year's per-ensemble Assembly dup that
 * enrolled every kid 13×) to one row per period+name for a clean schedule view. */
function dedupeSlots(slots: StudentScheduleSlot[]): StudentScheduleSlot[] {
  const seen = new Set<string>();
  const out: StudentScheduleSlot[] = [];
  for (const s of [...slots].sort((a, b) => a.period_number - b.period_number)) {
    const k = `${s.period_number}|${s.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

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

  // Per-ensemble current/next (cheap, one call) + expandable per-student detail.
  const [nowNext, setNowNext] = useState<Record<string, { current: string | null; next: string }>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [slotsByStudent, setSlotsByStudent] = useState<Record<string, StudentScheduleSlot[]>>({});

  // Load ensemble now/next and refresh each minute so the columns advance.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const headers = await getAuthHeaders();
        // ?now=HH:MM (testing) overrides the clock for the Current/Next columns.
        const now = new URLSearchParams(window.location.search).get('now');
        const qs = now ? `?now=${encodeURIComponent(now)}` : '';
        const res = await fetch(`/api/schedule/ensemble-now-next${qs}`, { headers });
        if (res.ok && !cancelled) setNowNext((await res.json()).byEnsemble ?? {});
      } catch {
        /* now/next is a nicety — ignore */
      }
    }
    load();
    const i = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [user, getAuthHeaders]);

  async function toggleExpand(student: Student) {
    if (expandedId === student.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(student.id);
    if (!slotsByStudent[student.id]) {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/students/${student.id}/schedule?format=slots`, { headers });
        if (res.ok) {
          const slots = ((await res.json()).slots as StudentScheduleSlot[]) ?? [];
          setSlotsByStudent((prev) => ({ ...prev, [student.id]: slots }));
        }
      } catch {
        setSlotsByStudent((prev) => ({ ...prev, [student.id]: [] }));
      }
    }
  }

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
      <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center">
        <div className="text-[var(--text-2)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] pb-20">
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-camp-green">Students</h1>
          <button type="button" onClick={openAdd} className="camp-btn-primary px-3 py-1.5 text-sm">
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
          <div className="text-center text-[var(--text-2)] py-8">Loading...</div>
        ) : (
          <div className="camp-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--accent-soft)] border-b border-[var(--glass-border)]">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Instrument</th>
                  <th className="px-4 py-2 text-left">Ensemble</th>
                  <th className="px-4 py-2 text-left">Current</th>
                  <th className="px-4 py-2 text-left">Next</th>
                  <th className="px-4 py-2 text-left">Dorm</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => {
                  const nn = student.ensemble ? nowNext[student.ensemble] : undefined;
                  const expanded = expandedId === student.id;
                  const slots = slotsByStudent[student.id];
                  return (
                    <Fragment key={student.id}>
                      <tr className="border-b border-[var(--glass-border)] hover:bg-[var(--surface)]">
                        <td className="px-4 py-2 font-semibold">
                          <button onClick={() => toggleExpand(student)} className="text-left hover:text-camp-green">
                            {expanded ? '▾' : '▸'} {student.first_name} {student.last_name}
                          </button>
                        </td>
                        <td className="px-4 py-2">{student.instrument}</td>
                        <td className="px-4 py-2">{student.ensemble}</td>
                        <td className="px-4 py-2 text-[var(--text-2)]">{nn ? (nn.current ?? 'No class') : '—'}</td>
                        <td className="px-4 py-2 text-[var(--text-3)]">{nn ? nn.next : '—'}</td>
                        <td className="px-4 py-2 text-[var(--text-2)]">{student.dorm_room || '-'}</td>
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
                      {expanded && (
                        <tr className="border-b border-[var(--glass-border)] bg-[var(--surface)]">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="text-sm">
                                <h3 className="mb-1 font-semibold text-camp-green">Details</h3>
                                <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-[var(--text-2)]">
                                  {student.preferred_name && (<><dt className="text-[var(--text-3)]">Preferred</dt><dd>{student.preferred_name}</dd></>)}
                                  <dt className="text-[var(--text-3)]">Division</dt><dd>{student.division}</dd>
                                  <dt className="text-[var(--text-3)]">Grade</dt><dd>{(student as Student & { grade?: string }).grade ?? '—'}</dd>
                                  <dt className="text-[var(--text-3)]">Dorm</dt><dd>{student.dorm_building || '—'} {student.dorm_room || ''}</dd>
                                  <dt className="text-[var(--text-3)]">Cell</dt><dd>{student.cell_phone || '—'}</dd>
                                  <dt className="text-[var(--text-3)]">Parent</dt><dd>{[student.parent_first_name, student.parent_last_name].filter(Boolean).join(' ') || '—'}{student.parent_phone ? ` · ${student.parent_phone}` : ''}</dd>
                                  <dt className="text-[var(--text-3)]">Email</dt><dd className="break-all">{student.email || '—'}</dd>
                                  {student.medical_notes && (<><dt className="text-[var(--text-3)]">Medical</dt><dd className="text-red-700">{student.medical_notes}</dd></>)}
                                </dl>
                              </div>
                              <div className="text-sm">
                                <h3 className="mb-1 font-semibold text-camp-green">Schedule</h3>
                                {!slots && <p className="text-[var(--text-3)]">Loading…</p>}
                                {slots && slots.length === 0 && <p className="text-[var(--text-3)]">No schedule.</p>}
                                {slots && slots.length > 0 && (
                                  <ul className="space-y-0.5 text-[var(--text-2)]">
                                    {dedupeSlots(slots).map((s) => (
                                      <li key={`${s.period_number}-${s.session_id}`}>
                                        <span className="text-[var(--text-3)]">P{s.period_number} {s.start_time}</span> · {s.name}
                                        {s.faculty_name ? <span className="text-[var(--text-3)]"> · {s.faculty_name}</span> : ''}
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
