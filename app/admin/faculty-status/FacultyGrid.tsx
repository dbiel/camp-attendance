'use client';

import { useMemo } from 'react';
import { deriveCellState } from '@/lib/attendance-rules';
import type { CoverageRow } from '@/lib/types';

interface Props {
  rows: CoverageRow[];
  onlyBehind: boolean;
  onCellClick: (sessionId: string) => void;
}

const CELL_COLOR: Record<string, string> = {
  'not-started': 'bg-gray-200 text-gray-700',
  'in-progress': 'bg-yellow-200 text-yellow-900',
  'mostly-done': 'bg-green-200 text-green-900',
  'has-absences': 'bg-red-200 text-red-900',
};

const ICON: Record<string, string> = {
  'not-started': '—',
  'in-progress': '◴',
  'mostly-done': '✓',
  'has-absences': '⚠',
};

export function FacultyGrid({ rows, onlyBehind, onCellClick }: Props) {
  const byFaculty = useMemo(() => {
    const map = new Map<string, { name: string; rows: CoverageRow[] }>();
    for (const r of rows) {
      if (!r.faculty_id) continue;
      if (!map.has(r.faculty_id)) {
        map.set(r.faculty_id, { name: r.teacher_name, rows: [] });
      }
      map.get(r.faculty_id)!.rows.push(r);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const periodNumbers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.period_number))).sort((a, b) => a - b),
    [rows]
  );

  // "Behind" = any session today is not yet mostly-done.
  const isBehind = (facultyRows: CoverageRow[]) =>
    facultyRows.some((r) => {
      const s = deriveCellState({
        total_students: r.total_students,
        marked_count: r.marked_count,
        absent_count: r.absent_count,
      });
      return s !== 'mostly-done';
    });

  const visibleFaculty = onlyBehind ? byFaculty.filter((f) => isBehind(f.rows)) : byFaculty;

  if (visibleFaculty.length === 0) {
    return <div className="text-center p-8 text-[var(--text-3)]">All caught up.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left bg-[var(--surface)]">Faculty</th>
            {periodNumbers.map((n) => (
              <th key={n} className="px-2 py-2 text-center bg-[var(--surface)]">P{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleFaculty.map(({ id, name, rows: fRows }) => (
            <tr key={id} className="border-b border-[var(--glass-border)]">
              <td className="px-2 py-2 font-semibold whitespace-nowrap">{name}</td>
              {periodNumbers.map((n) => {
                const r = fRows.find((x) => x.period_number === n);
                if (!r) return <td key={n} className="px-1 py-1" />;
                const state = deriveCellState({
                  total_students: r.total_students,
                  marked_count: r.marked_count,
                  absent_count: r.absent_count,
                });
                return (
                  <td key={n} className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => onCellClick(r.session_id)}
                      className={`w-full rounded text-xs font-bold py-1 ${CELL_COLOR[state]}`}
                      aria-label={`${name} period ${n}, ${state}, ${r.marked_count}/${r.total_students}`}
                    >
                      <span aria-hidden="true" className="mr-1">{ICON[state]}</span>
                      {r.marked_count}/{r.total_students}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
