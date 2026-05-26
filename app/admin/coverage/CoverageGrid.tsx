'use client';

import { useMemo } from 'react';
import { SessionCard } from './SessionCard';
import type { CoverageRow } from '@/lib/types';

interface Props {
  rows: CoverageRow[];
  onSessionClick: (sessionId: string) => void;
}

export function CoverageGrid({ rows, onSessionClick }: Props) {
  const grouped = useMemo(() => {
    const byPeriod = new Map<number, CoverageRow[]>();
    for (const r of rows) {
      if (!byPeriod.has(r.period_number)) byPeriod.set(r.period_number, []);
      byPeriod.get(r.period_number)!.push(r);
    }
    return Array.from(byPeriod.entries()).sort(([a], [b]) => a - b);
  }, [rows]);

  if (grouped.length === 0) {
    return <div className="text-center p-8 text-gray-500">No sessions match your filters.</div>;
  }

  return (
    <div className="space-y-6">
      {grouped.map(([periodNumber, periodRows]) => (
        <section key={periodNumber}>
          <h2 className="text-sm font-bold text-gray-600 mb-2">
            {periodRows[0].period_name} · {periodRows[0].start_time}–{periodRows[0].end_time}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {periodRows.map((row) => (
              <SessionCard
                key={row.session_id}
                row={row}
                onClick={() => onSessionClick(row.session_id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
