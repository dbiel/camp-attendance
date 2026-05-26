'use client';

import { deriveCellState, CellState } from '@/lib/attendance-rules';
import type { CoverageRow } from '@/lib/types';

interface Props {
  row: CoverageRow;
  onClick: () => void;
}

const COLOR: Record<CellState, string> = {
  'not-started': 'bg-gray-100 border-gray-300 text-gray-700',
  'in-progress': 'bg-yellow-50 border-yellow-300 text-yellow-900',
  'mostly-done': 'bg-green-50 border-green-400 text-green-900',
  'has-absences': 'bg-red-50 border-red-400 text-red-900',
};

const ICON: Record<CellState, string> = {
  'not-started': '—',
  'in-progress': '◴',
  'mostly-done': '✓',
  'has-absences': '⚠',
};

export function SessionCard({ row, onClick }: Props) {
  const state = deriveCellState({
    total_students: row.total_students,
    marked_count: row.marked_count,
    absent_count: row.absent_count,
  });
  const badge = state === 'has-absences'
    ? `${row.absent_count}/${row.total_students} absent`
    : `${row.marked_count}/${row.total_students}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border-2 transition-all hover:shadow-md ${COLOR[state]}`}
      aria-label={`${row.session_name}, ${state}, ${badge}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-bold truncate">
            <span aria-hidden="true" className="mr-2">{ICON[state]}</span>
            {row.session_name}
          </div>
          <div className="text-xs opacity-75 truncate">
            {row.teacher_name}
            {row.ensemble && ` · ${row.ensemble}`}
          </div>
        </div>
        <div className="text-xs font-semibold whitespace-nowrap">
          {badge}
        </div>
      </div>
    </button>
  );
}
