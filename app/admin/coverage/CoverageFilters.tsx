'use client';

import { CellState } from '@/lib/attendance-rules';

interface Props {
  teachers: { id: string; name: string }[];
  ensembles: string[];
  selectedTeacher: string;
  selectedEnsemble: string;
  selectedState: CellState | 'all';
  onChange: (next: { teacher?: string; ensemble?: string; state?: CellState | 'all' }) => void;
}

const STATE_LABEL: Record<CellState | 'all', string> = {
  'all': 'All',
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'mostly-done': 'Mostly done',
  'has-absences': 'Has absences',
};

export function CoverageFilters({
  teachers, ensembles, selectedTeacher, selectedEnsemble, selectedState, onChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <select
        className="camp-input w-48"
        value={selectedTeacher}
        onChange={(e) => onChange({ teacher: e.target.value })}
        aria-label="Filter by teacher"
      >
        <option value="">All Teachers</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <select
        className="camp-input w-40"
        value={selectedEnsemble}
        onChange={(e) => onChange({ ensemble: e.target.value })}
        aria-label="Filter by ensemble"
      >
        <option value="">All Ensembles</option>
        {ensembles.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>

      <div className="flex gap-1">
        {(['all', 'not-started', 'in-progress', 'mostly-done', 'has-absences'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ state: s })}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              selectedState === s
                ? 'bg-camp-green text-white'
                : 'bg-[var(--surface)] border border-[var(--glass-border)] text-[var(--text-2)] hover:bg-[var(--accent-soft)]'
            }`}
          >
            {STATE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
