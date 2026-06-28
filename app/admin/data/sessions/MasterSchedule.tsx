'use client';

import { useMemo, useState } from 'react';
import {
  buildByPeriod,
  TYPE_LABEL,
  TYPE_VAR,
  type SessionType,
} from '@/lib/master-schedule';

/**
 * Read-only browser for the camp's master room×period schedule (ported from the
 * standalone ttu-music-schedule app). Groups every room's session by period,
 * with search + type filter + color-coded cards. Data lives in
 * lib/master-schedule.ts (last year's; swap when the new master schedule lands).
 */
const FILTERS: { key: '' | SessionType; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'REH', label: 'Rehearsals' },
  { key: 'SEC', label: 'Sectionals' },
  { key: 'MASTER', label: 'Master' },
  { key: 'ELEC', label: 'Electives' },
];

export function MasterSchedule() {
  const periods = useMemo(() => buildByPeriod(), []);
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<'' | SessionType>('');

  const q = query.trim().toLowerCase();
  const filteredPeriods = periods
    .map(({ slot, sessions }) => ({
      slot,
      sessions: sessions.filter((c) => {
        if (activeType && c.type !== activeType) return false;
        if (q && !c.session.toLowerCase().includes(q) && !c.room.toLowerCase().includes(q)) return false;
        return true;
      }),
    }))
    .filter((p) => p.sessions.length > 0);

  const total = filteredPeriods.reduce((n, p) => n + p.sessions.length, 0);

  // Stat counts over the full (unfiltered) schedule.
  const counts = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = { all: 0 };
    for (const { sessions } of periods)
      for (const s of sessions) {
        c[s.type] = (c[s.type] || 0) + 1;
        c.all++;
      }
    return c;
  }, [periods]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {[
          { n: counts.all, label: 'Sessions', color: 'var(--accent)' },
          { n: counts.REH || 0, label: 'Rehearsals', color: TYPE_VAR.REH },
          { n: counts.SEC || 0, label: 'Sectionals', color: TYPE_VAR.SEC },
          { n: counts.MASTER || 0, label: 'Master', color: TYPE_VAR.MASTER },
          { n: counts.ELEC || 0, label: 'Electives', color: TYPE_VAR.ELEC },
        ].map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--glass-border)] bg-[var(--surface)] px-2.5 py-1"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="font-bold">{s.n}</span>
            {s.label}
          </span>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search room or session (e.g. B1, Oboe, Jazz)…"
          className="camp-input flex-1 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              onClick={() => setActiveType(f.key)}
              className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm ${
                activeType === f.key
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--glass-border)] text-[var(--text-2)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {(q || activeType) && (
        <p className="mb-2 text-xs text-[var(--text-3)]">
          {total} session{total !== 1 ? 's' : ''} found
        </p>
      )}

      {filteredPeriods.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-3)]">No sessions match your search.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredPeriods.map(({ slot, sessions }) => (
            <section key={slot.id}>
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-[var(--radius-pill)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">
                  Period {slot.period}
                </span>
                <span className="text-xs text-[var(--text-2)]">{slot.label}</span>
                <span className="text-xs text-[var(--text-3)]">
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {sessions.map((c, i) => (
                  <div
                    key={`${slot.id}-${c.room}-${i}`}
                    className="flex items-stretch gap-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--card)]"
                  >
                    <span className="w-1 shrink-0" style={{ background: TYPE_VAR[c.type] }} />
                    <div className="min-w-0 flex-1 py-2 pr-2">
                      <p className="truncate font-semibold text-[var(--text)]">{c.session}</p>
                      <p className="truncate text-xs text-[var(--text-3)]">📍 {c.room}</p>
                    </div>
                    <span
                      className="m-2 self-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[0.65rem] font-semibold"
                      style={{ background: `var(--${c.type.toLowerCase()}-bg)`, color: TYPE_VAR[c.type] }}
                    >
                      {TYPE_LABEL[c.type]}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
