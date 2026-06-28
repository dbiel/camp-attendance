'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

interface RosterRow {
  ref: number;
  first_name: string;
  last_name: string;
  instrument: string;
  grade: string;
  score_rank: number;
}

type Mark = 'present' | 'absent';

interface LoadData {
  ensemble: string;
  label: string | null;
  roster: RosterRow[];
  roster_size: number;
  submission: {
    marks_by_ref: Record<number, Mark> | null;
    locked: boolean;
    submitted_at: string;
    updated_at: string;
  } | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: LoadData };

type SortMode = 'score' | 'last';

export default function EnsembleAttendancePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [sortMode, setSortMode] = useState<SortMode>('score');
  // Instrument sections collapsed in score-order view (by instrument name).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/${token}`);
      if (res.status === 429) return; // transient — keep state
      if (!res.ok) {
        setState({ kind: 'invalid' });
        return;
      }
      const data = (await res.json()) as LoadData;
      setState({ kind: 'ready', data });
      // Default everyone present; overlay any prior submission's marks.
      const init: Record<number, Mark> = {};
      for (const r of data.roster) init[r.ref] = 'present';
      if (data.submission?.marks_by_ref) {
        for (const [ref, m] of Object.entries(data.submission.marks_by_ref)) init[Number(ref)] = m;
      }
      setMarks(init);
    } catch {
      setState({ kind: 'invalid' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedRoster = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const rows = [...state.data.roster];
    rows.sort((a, b) => {
      if (sortMode === 'score' && a.score_rank !== b.score_rank) return a.score_rank - b.score_rank;
      const ln = (a.last_name || '').localeCompare(b.last_name || '');
      if (ln !== 0) return ln;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
    return rows;
  }, [state, sortMode]);

  // Score-order view groups the roster by instrument into collapsible sections
  // ("Flute — 7"), ordered by score rank; within a section, students are
  // already last-name sorted (sortedRoster). Last-name view stays a flat list.
  const instrumentGroups = useMemo(() => {
    if (sortMode !== 'score') return null;
    const map = new Map<string, { rows: RosterRow[]; rank: number }>();
    for (const r of sortedRoster) {
      const key = r.instrument || '—';
      const g = map.get(key);
      if (g) g.rows.push(r);
      else map.set(key, { rows: [r], rank: r.score_rank });
    }
    return [...map.entries()]
      .map(([instrument, g]) => ({ instrument, rows: g.rows, rank: g.rank }))
      .sort((a, b) => a.rank - b.rank || a.instrument.localeCompare(b.instrument));
  }, [sortedRoster, sortMode]);

  function toggleGroup(instrument: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(instrument) ? next.delete(instrument) : next.add(instrument);
      return next;
    });
  }

  async function submit() {
    if (state.kind !== 'ready') return;
    setSubmitting(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch(`/api/e/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks, roster_size: state.data.roster_size }),
      });
      if (res.status === 409) {
        setError('The roster changed — reloading…');
        await load();
        return;
      }
      if (!res.ok) {
        setError('Could not submit. Please try again.');
        return;
      }
      const out = (await res.json()) as { newly_absent: number; arrived_count: number; absent_count: number };
      const parts: string[] = [];
      if (out.newly_absent > 0) parts.push(`${out.newly_absent} absence${out.newly_absent > 1 ? 's' : ''} reported`);
      if (out.arrived_count > 0) parts.push(`${out.arrived_count} marked arrived (tardy)`);
      setBanner(parts.length ? `Submitted — ${parts.join(', ')}.` : 'Submitted — all present. Thank you!');
      await load();
    } catch {
      setError('Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === 'loading') {
    return <main className="mx-auto max-w-md p-6 text-center text-sm text-[var(--text-3)]">Loading…</main>;
  }
  if (state.kind === 'invalid') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--text)]">This link is no longer active</h1>
        <p className="text-sm text-[var(--text-2)]">Please ask the camp office for a new attendance link.</p>
      </main>
    );
  }

  const { data } = state;
  const absentCount = Object.values(marks).filter((m) => m === 'absent').length;

  const renderRow = (r: RosterRow) => {
    const mark = marks[r.ref] ?? 'present';
    return (
      <li
        key={r.ref}
        className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface)] p-2"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--text)]">
            {r.first_name} {r.last_name}
          </p>
          <p className="truncate text-xs text-[var(--text-3)]">
            {r.instrument || '—'}
            {r.grade ? ` · Grade ${r.grade}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setMarks((p) => ({ ...p, [r.ref]: 'present' }))}
            className={
              mark === 'present'
                ? 'btn-present text-sm'
                : 'rounded-lg bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--text-2)]'
            }
          >
            Present
          </button>
          <button
            onClick={() => setMarks((p) => ({ ...p, [r.ref]: 'absent' }))}
            className={
              mark === 'absent'
                ? 'btn-absent text-sm'
                : 'rounded-lg bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--text-2)]'
            }
          >
            Absent
          </button>
        </div>
      </li>
    );
  };

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold text-[var(--text)]">{data.ensemble}</h1>
      <p className="text-sm text-[var(--text-2)]">Attendance{data.label ? ` · ${data.label}` : ''}</p>
      {data.submission && (
        <p className="mt-1 text-xs text-[var(--text-3)]">
          Last submitted {new Date(data.submission.submitted_at).toLocaleString()} — you can update if a
          student arrives.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex overflow-hidden rounded-[var(--radius-pill)] border border-[var(--glass-border)] text-sm">
          <button
            onClick={() => setSortMode('score')}
            className={`px-3 py-1 ${sortMode === 'score' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}
          >
            Score order
          </button>
          <button
            onClick={() => setSortMode('last')}
            className={`px-3 py-1 ${sortMode === 'last' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}
          >
            Last name
          </button>
        </div>
        <span className="text-sm font-semibold text-[var(--text-2)]">{absentCount} absent</span>
      </div>

      {instrumentGroups ? (
        // Score-order: collapsible instrument sections — "Flute — 7".
        <div className="mt-3 flex flex-col gap-2">
          {instrumentGroups.map((g) => {
            const open = !collapsed.has(g.instrument);
            const absentInGroup = g.rows.filter((r) => (marks[r.ref] ?? 'present') === 'absent').length;
            return (
              <div key={g.instrument}>
                <button
                  onClick={() => toggleGroup(g.instrument)}
                  className="flex w-full items-center justify-between rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2 text-left font-bold text-[var(--text)]"
                >
                  <span>
                    {open ? '▾' : '▸'} {g.instrument} — {g.rows.length}
                  </span>
                  {absentInGroup > 0 && (
                    <span className="text-xs font-semibold text-red-700">{absentInGroup} absent</span>
                  )}
                </button>
                {open && <ul className="mt-1 flex flex-col gap-1">{g.rows.map(renderRow)}</ul>}
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">{sortedRoster.map(renderRow)}</ul>
      )}

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      {banner && <p className="mt-3 rounded bg-green-50 p-2 text-center text-sm text-green-800">{banner}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="camp-btn-primary sticky bottom-3 mt-4 w-full px-4 py-3 text-base shadow-lg disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : data.submission ? 'Update attendance' : 'Submit attendance'}
      </button>
    </main>
  );
}
