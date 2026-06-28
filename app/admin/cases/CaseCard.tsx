'use client';

import Link from 'next/link';
import type { Case } from '@/lib/cases';

/** Minutes since the incident occurred (occurred_at is always set). */
function elapsedMins(c: Case): number {
  const t = new Date(c.occurred_at || c.created_at).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

function fmtElapsed(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const URGENT_AFTER_MIN = 30;

export function CaseCard({
  c,
  selected,
  onToggleSelect,
}: {
  c: Case;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const mins = elapsedMins(c);
  const urgent = mins >= URGENT_AFTER_MIN;
  const dorm =
    c.dorm_building || c.dorm_room
      ? `${c.dorm_building ?? ''}${c.dorm_room ? ` ${c.dorm_room}` : ''}`.trim()
      : null;
  // Only assert "Commuter" when division is KNOWN to say so — never synthesize
  // it from a missing dorm (a not-yet-denormalized legacy case would misdirect
  // staff away from the dorm). Unknown → neutral "Dorm —".
  const locator = dorm ?? (c.division && /commut/i.test(c.division) ? 'Commuter' : 'Dorm —');

  // E4: the checkbox is a SIBLING of the navigable Link (never inside it), so
  // selecting a report can never navigate to its detail page.
  return (
    <div
      className={`flex items-stretch gap-2 rounded-lg border shadow-sm ${
        urgent ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'
      } ${selected ? 'ring-2 ring-camp-green' : ''}`}
    >
      {onToggleSelect && (
        <label className="flex cursor-pointer items-center pl-3" title="Select for a combined staff link">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={!!selected}
            onChange={() => onToggleSelect(c.id)}
            aria-label={`Select ${c.student_name}`}
          />
        </label>
      )}
      <Link href={`/admin/cases/${c.id}`} className="block flex-1 p-4 hover:bg-black/5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">
            {c.student_name}
            {c.instrument && <span className="ml-2 text-sm font-normal text-gray-500">{c.instrument}</span>}
          </span>
          <span className={`shrink-0 text-sm ${urgent ? 'font-bold text-red-700' : 'text-gray-600'}`}>
            {fmtElapsed(mins)} ago
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-800">{c.summary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {/* Dorm is a LOCATOR (where to look) — not proof the kid is there. */}
          <span title="Dorm location — where to look, not a presence check">
            🏠 {locator}
          </span>
          {c.session_label && <span>· {c.session_label}</span>}
          {c.reporter_name && <span>· by {c.reporter_name}</span>}
        </div>
      </Link>
    </div>
  );
}
