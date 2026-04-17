'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { Student } from '@/lib/types';

type ScheduleStatus = 'present' | 'absent' | 'tardy' | 'unmarked';

interface ScheduleEntry {
  session_id: string;
  session_name: string;
  period_name: string;
  start_time: string;
  end_time: string;
  location: string | null;
  status: ScheduleStatus;
}

interface StudentWithSchedule extends Student {
  schedule_for_date?: ScheduleEntry[];
}

export interface StudentDetailModalProps {
  studentId: string | null;
  date: string;
  onClose: () => void;
  onUpdate?: (student: Student) => void;
}

type EditableKey =
  | 'preferred_name'
  | 'gender'
  | 'division'
  | 'instrument'
  | 'ensemble'
  | 'chair_number'
  | 'dorm_building'
  | 'dorm_room'
  | 'email'
  | 'cell_phone'
  | 'parent_first_name'
  | 'parent_last_name'
  | 'parent_phone'
  | 'medical_notes'
  | 'additional_info';

interface FieldDef {
  key: EditableKey;
  label: string;
  type: 'text' | 'number' | 'textarea';
  section:
    | 'Identity'
    | 'Ensemble'
    | 'Contact'
    | 'Parent'
    | 'Housing'
    | 'Medical'
    | 'Notes';
}

const FIELDS: FieldDef[] = [
  { key: 'preferred_name', label: 'Preferred Name', type: 'text', section: 'Identity' },
  { key: 'gender', label: 'Gender', type: 'text', section: 'Identity' },
  { key: 'division', label: 'Division', type: 'text', section: 'Identity' },
  { key: 'chair_number', label: 'Chair', type: 'number', section: 'Identity' },
  { key: 'instrument', label: 'Instrument', type: 'text', section: 'Ensemble' },
  { key: 'ensemble', label: 'Ensemble', type: 'text', section: 'Ensemble' },
  { key: 'email', label: 'Email', type: 'text', section: 'Contact' },
  { key: 'cell_phone', label: 'Cell Phone', type: 'text', section: 'Contact' },
  { key: 'parent_first_name', label: 'Parent First', type: 'text', section: 'Parent' },
  { key: 'parent_last_name', label: 'Parent Last', type: 'text', section: 'Parent' },
  { key: 'parent_phone', label: 'Parent Phone', type: 'text', section: 'Parent' },
  { key: 'dorm_building', label: 'Dorm Building', type: 'text', section: 'Housing' },
  { key: 'dorm_room', label: 'Dorm Room', type: 'text', section: 'Housing' },
  { key: 'medical_notes', label: 'Medical Notes', type: 'textarea', section: 'Medical' },
  { key: 'additional_info', label: 'Additional Info', type: 'textarea', section: 'Notes' },
];

const SECTION_ORDER: FieldDef['section'][] = [
  'Identity',
  'Ensemble',
  'Contact',
  'Parent',
  'Housing',
  'Medical',
  'Notes',
];

function statusPillClass(status: ScheduleStatus): string {
  switch (status) {
    case 'present':
      return 'bg-green-100 text-green-800 border border-green-300';
    case 'absent':
      return 'bg-red-100 text-red-800 border border-red-300';
    case 'tardy':
      return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-300';
  }
}

interface EditableFieldProps {
  fieldKey: EditableKey;
  label: string;
  type: 'text' | 'number' | 'textarea';
  value: string | number | undefined;
  onSave: (newValue: string | number | undefined) => Promise<void>;
  saving?: boolean;
}

function EditableField({ fieldKey, label, type, value, onSave, saving }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === undefined || value === null ? '' : String(value));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  // Re-sync when the external value changes (e.g. from a fetched student).
  useEffect(() => {
    if (!editing) {
      setDraft(value === undefined || value === null ? '' : String(value));
    }
  }, [value, editing]);

  const startEdit = useCallback(() => {
    committedRef.current = false;
    setDraft(value === undefined || value === null ? '' : String(value));
    setEditing(true);
  }, [value]);

  const commit = useCallback(async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const originalStr = value === undefined || value === null ? '' : String(value);
    if (draft === originalStr) return;
    if (type === 'number') {
      const n = draft === '' ? undefined : Number(draft);
      if (n !== undefined && Number.isNaN(n)) return;
      await onSave(n);
    } else {
      await onSave(draft);
    }
  }, [draft, onSave, type, value]);

  const cancel = useCallback(() => {
    committedRef.current = true; // block any queued blur
    setDraft(value === undefined || value === null ? '' : String(value));
    setEditing(false);
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      void commit();
    }
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) {
        try {
          (inputRef.current as HTMLInputElement).select();
        } catch {
          // ignore for textarea
        }
      }
    }
  }, [editing]);

  const display =
    value === undefined || value === null || value === '' ? (
      <span className="text-gray-400 italic">—</span>
    ) : (
      String(value)
    );

  return (
    <div className="flex flex-col">
      <label className="text-xs font-semibold uppercase text-gray-500 mb-0.5">{label}</label>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            ref={(el) => {
              inputRef.current = el;
            }}
            data-testid={`field-input-${fieldKey}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={onKeyDown}
            rows={4}
            className="border border-camp-green rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-camp-green"
          />
        ) : (
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            data-testid={`field-input-${fieldKey}`}
            type={type === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={onKeyDown}
            className="border border-camp-green rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-camp-green"
          />
        )
      ) : (
        <button
          type="button"
          data-testid={`field-${fieldKey}`}
          onClick={startEdit}
          className="text-left text-sm px-2 py-1 rounded hover:bg-gray-100 border border-transparent hover:border-gray-200 min-h-[28px]"
        >
          {display}
          {saving && <span className="ml-2 text-xs text-gray-400">Saving…</span>}
        </button>
      )}
    </div>
  );
}

export function StudentDetailModal({ studentId, date, onClose, onUpdate }: StudentDetailModalProps) {
  const { getAuthHeaders } = useAuth();
  const { push } = useToast();

  const [student, setStudent] = useState<StudentWithSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<EditableKey | null>(null);

  useEffect(() => {
    if (!studentId) {
      setStudent(null);
      setError(null);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const url = `/api/students/${encodeURIComponent(studentId)}?with_schedule=1&date=${encodeURIComponent(date)}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`Failed to load student (${res.status})`);
        }
        const data = (await res.json()) as StudentWithSchedule;
        if (!cancelled) setStudent(data);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load student';
          setError(msg);
          push({ kind: 'error', text: msg });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, date]);

  const saveField = useCallback(
    async (key: EditableKey, newValue: string | number | undefined) => {
      if (!student || !studentId) return;
      const previous = student[key as keyof StudentWithSchedule] as
        | string
        | number
        | undefined;
      // Optimistic update
      setStudent((prev) => (prev ? ({ ...prev, [key]: newValue } as StudentWithSchedule) : prev));
      setSavingField(key);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ [key]: newValue }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        const updated = (await res.json()) as Student;
        setStudent((prev) =>
          prev ? ({ ...prev, ...updated } as StudentWithSchedule) : prev
        );
        push({ kind: 'success', text: `Updated ${key.replace(/_/g, ' ')}` });
        onUpdate?.(updated);
      } catch (err) {
        // Revert
        setStudent((prev) => (prev ? ({ ...prev, [key]: previous } as StudentWithSchedule) : prev));
        const msg = err instanceof Error ? err.message : 'Save failed';
        push({ kind: 'error', text: msg });
      } finally {
        setSavingField(null);
      }
    },
    [student, studentId, getAuthHeaders, push, onUpdate]
  );

  const open = studentId !== null;
  const title = student
    ? `${student.first_name} ${student.last_name}`
    : 'Student';

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {loading && !student ? (
        <div className="p-8 text-center text-gray-500">Loading student…</div>
      ) : error && !student ? (
        <div className="p-6 text-center text-red-600">{error}</div>
      ) : student ? (
        <div>
          {/* Header strip */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-3 mb-4">
            <div className="text-lg font-semibold text-camp-green">
              {student.first_name}
              {student.preferred_name ? ` (${student.preferred_name})` : ''}{' '}
              {student.last_name}
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{student.ensemble || 'Unassigned'}</span>
              {typeof student.chair_number === 'number' && (
                <span className="ml-2 px-2 py-0.5 bg-camp-green text-white rounded text-xs font-bold">
                  Chair {student.chair_number}
                </span>
              )}
              <span className="ml-2 text-gray-500">{student.instrument}</span>
            </div>
          </div>

          {/* Medical banner */}
          {student.medical_notes && student.medical_notes.trim() !== '' && (
            <div
              data-testid="medical-notes-banner"
              className="bg-yellow-100 border border-yellow-400 text-yellow-900 rounded p-3 mb-4"
            >
              <div className="text-xs font-bold uppercase tracking-wide mb-1">
                Medical Notes
              </div>
              <div className="text-sm whitespace-pre-wrap">{student.medical_notes}</div>
            </div>
          )}

          {/* Editable field grid — grouped by section */}
          <div className="space-y-4 mb-6">
            {SECTION_ORDER.map((section) => {
              const sectionFields = FIELDS.filter((f) => f.section === section);
              if (sectionFields.length === 0) return null;
              return (
                <div key={section}>
                  <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wide mb-2">
                    {section}
                  </h3>
                  <div
                    className={
                      section === 'Medical' || section === 'Notes'
                        ? 'grid grid-cols-1 gap-3'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                    }
                  >
                    {sectionFields.map((field) => (
                      <EditableField
                        key={field.key}
                        fieldKey={field.key}
                        label={field.label}
                        type={field.type}
                        value={student[field.key as keyof StudentWithSchedule] as
                          | string
                          | number
                          | undefined}
                        saving={savingField === field.key}
                        onSave={(val) => saveField(field.key, val)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today's schedule */}
          <div>
            <h3 className="text-sm font-bold text-camp-green mb-2">
              Schedule — {date}
            </h3>
            {!student.schedule_for_date || student.schedule_for_date.length === 0 ? (
              <div className="text-sm text-gray-500 italic">No sessions scheduled.</div>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
                {student.schedule_for_date.map((entry) => (
                  <li
                    key={`${entry.session_id}-${entry.period_name}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {entry.period_name}
                        <span className="ml-2 text-gray-500 font-normal">
                          {entry.start_time}–{entry.end_time}
                        </span>
                        {entry.location && (
                          <span className="ml-2 text-gray-500 font-normal">
                            · {entry.location}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        {entry.session_name}{' '}
                        <span className="text-gray-400">({entry.session_id})</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${statusPillClass(entry.status)}`}
                    >
                      {entry.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
