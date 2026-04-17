'use client';

import { useId } from 'react';
import { Student } from '@/lib/types';
import { Modal } from '@/components/Modal';

export type StudentDraft = Partial<Student>;

export const REQUIRED_FIELDS: Array<keyof Student> = [
  'first_name',
  'last_name',
  'instrument',
];

export const EMPTY_DRAFT: StudentDraft = {
  first_name: '',
  last_name: '',
  preferred_name: '',
  gender: '',
  division: 'Overnight Camper',
  instrument: '',
  ensemble: '',
  chair_number: undefined,
  email: '',
  cell_phone: '',
  parent_first_name: '',
  parent_last_name: '',
  parent_phone: '',
  dorm_building: '',
  dorm_room: '',
  medical_notes: '',
};

export function draftFromStudent(s: Student): StudentDraft {
  return {
    first_name: s.first_name,
    last_name: s.last_name,
    preferred_name: s.preferred_name ?? '',
    gender: s.gender ?? '',
    division: s.division ?? 'Overnight Camper',
    instrument: s.instrument,
    ensemble: s.ensemble,
    chair_number: s.chair_number,
    email: s.email ?? '',
    cell_phone: s.cell_phone ?? '',
    parent_first_name: s.parent_first_name ?? '',
    parent_last_name: s.parent_last_name ?? '',
    parent_phone: s.parent_phone ?? '',
    dorm_building: s.dorm_building ?? '',
    dorm_room: s.dorm_room ?? '',
    medical_notes: s.medical_notes ?? '',
  };
}

// Normalize a draft into a PUT/POST payload. Empty strings are omitted so optional
// fields stay unset server-side; chair_number is parsed into a number.
export function serializeDraft(draft: StudentDraft): Partial<Student> {
  const out: Partial<Student> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (v === '' || v === undefined || v === null) continue;
    if (k === 'chair_number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isNaN(n)) (out as Record<string, unknown>)[k] = n;
      continue;
    }
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface FieldErrors {
  first_name?: string;
  last_name?: string;
  instrument?: string;
}

export function validateDraft(draft: StudentDraft): FieldErrors {
  const errors: FieldErrors = {};
  for (const key of REQUIRED_FIELDS) {
    const v = draft[key];
    if (typeof v !== 'string' || v.trim() === '') {
      errors[key as keyof FieldErrors] = 'Required';
    }
  }
  return errors;
}

export type EditMode = 'edit' | 'add';

interface EditStudentModalProps {
  open: boolean;
  mode: EditMode;
  draft: StudentDraft;
  setDraft: (next: StudentDraft) => void;
  errors: FieldErrors;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}

export function EditStudentModal({
  open,
  mode,
  draft,
  setDraft,
  errors,
  saving,
  onSave,
  onClose,
}: EditStudentModalProps) {
  const title = mode === 'add' ? 'Add Student' : 'Edit Student';
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Modal open={open} title={title} onClose={onClose} size="xl">
      <EditStudentForm
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        saving={saving}
        hasErrors={hasErrors}
        onSave={onSave}
        onCancel={onClose}
      />
    </Modal>
  );
}

interface DeleteStudentModalProps {
  target: Student | null;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteStudentModal({
  target,
  deleting,
  onConfirm,
  onClose,
}: DeleteStudentModalProps) {
  return (
    <Modal
      open={target !== null}
      title={
        target ? `Delete ${target.first_name} ${target.last_name}?` : 'Delete student?'
      }
      onClose={() => !deleting && onClose()}
      size="md"
    >
      <p className="text-sm text-gray-700 mb-6">
        This permanently removes the student from the roster. This action cannot be
        undone.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={onClose}
          disabled={deleting}
          className="flex-1 camp-btn-outline py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

interface EditStudentFormProps {
  draft: StudentDraft;
  setDraft: (next: StudentDraft) => void;
  errors: FieldErrors;
  saving: boolean;
  hasErrors: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function EditStudentForm({
  draft,
  setDraft,
  errors,
  saving,
  hasErrors,
  onSave,
  onCancel,
}: EditStudentFormProps) {
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const errId = (name: string) => `${uid}-${name}-err`;

  function update<K extends keyof StudentDraft>(key: K, value: StudentDraft[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Identity */}
      <Section title="Identity">
        <Field
          id={fid('first_name')}
          label="First Name"
          required
          error={errors.first_name}
          errorId={errId('first_name')}
        >
          <input
            id={fid('first_name')}
            type="text"
            value={draft.first_name ?? ''}
            onChange={(e) => update('first_name', e.target.value)}
            aria-invalid={!!errors.first_name}
            aria-describedby={errors.first_name ? errId('first_name') : undefined}
            className="camp-input"
            required
          />
        </Field>

        <Field
          id={fid('last_name')}
          label="Last Name"
          required
          error={errors.last_name}
          errorId={errId('last_name')}
        >
          <input
            id={fid('last_name')}
            type="text"
            value={draft.last_name ?? ''}
            onChange={(e) => update('last_name', e.target.value)}
            aria-invalid={!!errors.last_name}
            aria-describedby={errors.last_name ? errId('last_name') : undefined}
            className="camp-input"
            required
          />
        </Field>

        <Field id={fid('preferred_name')} label="Preferred Name">
          <input
            id={fid('preferred_name')}
            type="text"
            value={draft.preferred_name ?? ''}
            onChange={(e) => update('preferred_name', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('gender')} label="Gender">
          <input
            id={fid('gender')}
            type="text"
            value={draft.gender ?? ''}
            onChange={(e) => update('gender', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('division')} label="Division">
          <select
            id={fid('division')}
            value={draft.division ?? ''}
            onChange={(e) => update('division', e.target.value)}
            className="camp-input"
          >
            <option value="Commuter Camper">Commuter Camper</option>
            <option value="Overnight Camper">Overnight Camper</option>
          </select>
        </Field>
      </Section>

      {/* Ensemble */}
      <Section title="Ensemble">
        <Field
          id={fid('instrument')}
          label="Instrument"
          required
          error={errors.instrument}
          errorId={errId('instrument')}
        >
          <input
            id={fid('instrument')}
            type="text"
            value={draft.instrument ?? ''}
            onChange={(e) => update('instrument', e.target.value)}
            aria-invalid={!!errors.instrument}
            aria-describedby={errors.instrument ? errId('instrument') : undefined}
            className="camp-input"
            required
          />
        </Field>

        <Field id={fid('ensemble')} label="Ensemble">
          <input
            id={fid('ensemble')}
            type="text"
            value={draft.ensemble ?? ''}
            onChange={(e) => update('ensemble', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('chair_number')} label="Chair">
          <input
            id={fid('chair_number')}
            type="number"
            min={1}
            value={
              draft.chair_number === undefined || draft.chair_number === null
                ? ''
                : String(draft.chair_number)
            }
            onChange={(e) => {
              const v = e.target.value;
              update('chair_number', v === '' ? undefined : Number(v));
            }}
            className="camp-input"
          />
        </Field>
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <Field id={fid('email')} label="Email">
          <input
            id={fid('email')}
            type="email"
            value={draft.email ?? ''}
            onChange={(e) => update('email', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('cell_phone')} label="Cell Phone">
          <input
            id={fid('cell_phone')}
            type="tel"
            value={draft.cell_phone ?? ''}
            onChange={(e) => update('cell_phone', e.target.value)}
            className="camp-input"
          />
        </Field>
      </Section>

      {/* Parent */}
      <Section title="Parent">
        <Field id={fid('parent_first_name')} label="Parent First Name">
          <input
            id={fid('parent_first_name')}
            type="text"
            value={draft.parent_first_name ?? ''}
            onChange={(e) => update('parent_first_name', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('parent_last_name')} label="Parent Last Name">
          <input
            id={fid('parent_last_name')}
            type="text"
            value={draft.parent_last_name ?? ''}
            onChange={(e) => update('parent_last_name', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('parent_phone')} label="Parent Phone">
          <input
            id={fid('parent_phone')}
            type="tel"
            value={draft.parent_phone ?? ''}
            onChange={(e) => update('parent_phone', e.target.value)}
            className="camp-input"
          />
        </Field>
      </Section>

      {/* Housing */}
      <Section title="Housing">
        <Field id={fid('dorm_building')} label="Dorm Building">
          <input
            id={fid('dorm_building')}
            type="text"
            value={draft.dorm_building ?? ''}
            onChange={(e) => update('dorm_building', e.target.value)}
            className="camp-input"
          />
        </Field>

        <Field id={fid('dorm_room')} label="Dorm Room">
          <input
            id={fid('dorm_room')}
            type="text"
            value={draft.dorm_room ?? ''}
            onChange={(e) => update('dorm_room', e.target.value)}
            className="camp-input"
          />
        </Field>
      </Section>

      {/* Medical — full-width textarea with yellow highlight if non-empty */}
      <div className="mb-6">
        <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wide mb-2">
          Medical
        </h3>
        <label htmlFor={fid('medical_notes')} className="camp-label">
          Medical Notes
        </label>
        <textarea
          id={fid('medical_notes')}
          rows={4}
          value={draft.medical_notes ?? ''}
          onChange={(e) => update('medical_notes', e.target.value)}
          className={`camp-input ${
            draft.medical_notes && draft.medical_notes.trim() !== ''
              ? 'bg-yellow-50 border-yellow-400'
              : ''
          }`}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || hasErrors}
          className="flex-1 camp-btn-primary py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 camp-btn-outline py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wide mb-2">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}

function Field({ id, label, required, error, errorId, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="camp-label">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
