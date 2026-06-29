'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { StudentIncidentLayer } from './StudentIncidentLayer';

interface RosterRow {
  ref: number;
  first_name: string;
  last_name: string;
  instrument: string;
  grade: string;
  score_rank: number;
}

type Mark = 'present' | 'absent';

interface SessionInfo {
  status: 'rehearsal' | 'no_rehearsal' | 'forced';
  forced: boolean;
  period_number: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  next: { period_name: string; start_time: string } | null;
}

interface LoadData {
  ensemble: string;
  label: string | null;
  session: SessionInfo;
  roster: RosterRow[];
  roster_size: number;
  report_refs: number[];
  marked_absent: Record<number, { note: string; until: string; all_day: boolean }>;
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
  // Snapshot of marks as last loaded/submitted — when `marks` differs, there are
  // unsaved changes and the submit button pulses.
  const [baseline, setBaseline] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('score');
  // Instrument sections collapsed in score-order view (by instrument name).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Clock hour the taker force-opened attendance for (null = not forced). The
  // forced window auto-expires when the wall clock ticks into the next hour.
  const [forcedHour, setForcedHour] = useState<number | null>(null);
  const [openReportRef, setOpenReportRef] = useState<number | null>(null);

  // Forward a `?now=HH:MM` test override (if present in the page URL) to the API.
  const nowQuery =
    typeof window !== 'undefined' && /[?&]now=\d{1,2}:\d{2}/.test(window.location.search)
      ? `?now=${new URLSearchParams(window.location.search).get('now')}`
      : '';

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/${token}${nowQuery}`);
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
      // Office-marked absences default the row to Absent (a saved submission still wins).
      for (const refStr of Object.keys(data.marked_absent ?? {})) init[Number(refStr)] = 'absent';
      if (data.submission?.marks_by_ref) {
        for (const [ref, m] of Object.entries(data.submission.marks_by_ref)) init[Number(ref)] = m;
      }
      setMarks(init);
      setBaseline(JSON.stringify(init));
    } catch {
      setState({ kind: 'invalid' });
    }
  }, [token, nowQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // Camp-local wall clock (HH:MM), ticked each second, used for the countdown
  // and to trigger a reload exactly when a period boundary passes.
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date())
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-rollover: in a rehearsal, reload when the wall clock reaches end_time
  // (the period rolled); idle, poll once a minute to pick up the next start.
  // Skipped entirely under a `?now=` test override (frozen clock).
  const sessEnd = state.kind === 'ready' ? state.data.session.end_time : null;
  const sessStatus = state.kind === 'ready' ? state.data.session.status : null;
  useEffect(() => {
    if (!clock || nowQuery) return;
    // A live slot (rehearsal or forced) ends at end_time → reload to roll over.
    if ((sessStatus === 'rehearsal' || sessStatus === 'forced') && sessEnd && clock >= sessEnd) load();
    // Idle: poll at the top of the hour to pick up the next rehearsal's start.
    if (sessStatus === 'no_rehearsal' && clock.endsWith(':00')) load();
  }, [clock, sessStatus, sessEnd, nowQuery, load]);

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
      const res = await fetch(`/api/e/${token}/submit${nowQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // force when this isn't a scheduled rehearsal (taker force-opened the
        // hour); the server ignores it when a real rehearsal is in session.
        body: JSON.stringify({
          marks,
          roster_size: state.data.roster_size,
          force: state.data.session.status !== 'rehearsal',
        }),
      });
      if (res.status === 409) {
        // Roster changed, or the period rolled over — reload to the live state.
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? 'Please reload — the session changed.');
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

  async function exportXlsx() {
    setError(null);
    try {
      const res = await fetch(`/api/e/${token}/export`);
      if (!res.ok) {
        setError('Could not export the roster. Please try again.');
        return;
      }
      const blob = await res.blob();
      const fname =
        (state.kind === 'ready' ? `${state.data.ensemble}-roster.xlsx` : 'roster.xlsx').replace(
          /[^a-z0-9.\-]+/gi,
          '-'
        );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('Could not export the roster.');
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

  // Per-row "Previous Report" comes from today's reports (active+resolved).
  const reportRefs = new Set(data.report_refs ?? []);
  // The "Needs attention" pin now lists the kids the OFFICE excused.
  const excusedRows = data.roster.filter((r) => data.marked_absent?.[r.ref]);

  // Active = a slot is live and the taker can mark/submit: a scheduled rehearsal,
  // a server-resumed forced hour, or a locally force-opened hour (this clock hour
  // only — it auto-expires when the wall clock rolls into the next hour).
  const clockHour = clock ? Number(clock.slice(0, 2)) : null;
  const localForced = forcedHour !== null && clockHour === forcedHour;
  const active = data.session.status === 'rehearsal' || data.session.status === 'forced' || localForced;

  // The live-window label: server rehearsal/forced if present, else the locally
  // forced clock hour.
  const fh = forcedHour ?? 0;
  const live =
    data.session.status !== 'no_rehearsal' && data.session.period_name
      ? {
          title: data.session.forced ? 'Forced attendance' : data.session.period_name,
          range: `${data.session.start_time}–${data.session.end_time}`,
          location: data.session.location,
          end: data.session.end_time,
        }
      : localForced
        ? {
            title: 'Forced attendance',
            range: `${String(fh).padStart(2, '0')}:00–${String(fh + 1).padStart(2, '0')}:00`,
            location: null as string | null,
            end: `${String(fh + 1).padStart(2, '0')}:00`,
          }
        : null;

  const absentCount = Object.values(marks).filter((m) => m === 'absent').length;
  const dirty = JSON.stringify(marks) !== baseline;

  const renderRow = (r: RosterRow) => {
    const mark = marks[r.ref] ?? 'present';
    const idle = mark === 'present' ? 'btn-present text-sm' : 'rounded-lg bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--text-2)]';
    const idleAbsent = mark === 'absent' ? 'btn-absent text-sm' : 'rounded-lg bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--text-2)]';
    return (
      <li
        key={r.ref}
        className={`flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface)] p-2 ${
          active ? '' : 'opacity-50'
        }`}
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--text)]">
            {r.first_name} {r.last_name}
          </p>
          <p className="truncate text-xs text-[var(--text-3)]">
            {r.instrument || '—'}
            {r.grade ? ` · Grade ${r.grade}` : ''}
          </p>
          {reportRefs.has(r.ref) && (
            <button
              onClick={() => setOpenReportRef(r.ref)}
              className="mt-0.5 text-xs font-semibold text-red-700 underline"
            >
              📄 Previous Report →
            </button>
          )}
          {data.marked_absent?.[r.ref] && (
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              {data.marked_absent[r.ref].all_day
                ? 'Office: out all day'
                : `Office: out until ${data.marked_absent[r.ref].until}`}
              {data.marked_absent[r.ref].note ? ` — ${data.marked_absent[r.ref].note}` : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            disabled={!active}
            onClick={() => setMarks((p) => ({ ...p, [r.ref]: 'present' }))}
            className={`${idle} ${active ? '' : 'cursor-not-allowed'}`}
          >
            Present
          </button>
          <button
            disabled={!active}
            onClick={() => setMarks((p) => ({ ...p, [r.ref]: 'absent' }))}
            className={`${idleAbsent} ${active ? '' : 'cursor-not-allowed'}`}
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
      {active && live && (
        <div className="mt-1 flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2">
          <span className="font-semibold text-[var(--text)]">
            {live.title} · {live.range}
            {live.location ? ` · ${live.location}` : ''}
          </span>
          <span className="shrink-0 text-xs text-[var(--text-3)]">until {live.end}</span>
        </div>
      )}
      {!active && (
        <div className="mt-1 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface)] px-3 py-2">
          <p className="text-sm font-semibold text-[var(--text)]">No rehearsal right now</p>
          <p className="text-xs text-[var(--text-2)]">
            {data.session.next
              ? `Next: ${data.session.next.period_name} · ${data.session.next.start_time}`
              : 'Done for the day.'}
          </p>
        </div>
      )}
      {data.submission && (
        <p className="mt-1 text-xs text-[var(--text-3)]">
          Last submitted {new Date(data.submission.submitted_at).toLocaleString()} — you can update if a
          student arrives.
        </p>
      )}
      <button onClick={exportXlsx} className="camp-btn-outline mt-2 px-3 py-1 text-xs">
        ⬇ Export roster (.xlsx)
      </button>

      {excusedRows.length > 0 && (
        <section className="mt-3 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 p-2">
          <h2 className="text-sm font-bold text-amber-800">Needs attention — {excusedRows.length} (excused by office)</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {excusedRows.map((r) => {
              const a = data.marked_absent[r.ref];
              return (
                <li key={r.ref} className="rounded border border-amber-200 bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-[var(--text)]">🟡 {r.first_name} {r.last_name}</span>
                  <span className="ml-2 text-xs text-amber-700">
                    {a.all_day ? 'out all day' : `out until ${a.until}`}{a.note ? ` · ${a.note}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
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

      {active ? (
        <button
          onClick={submit}
          disabled={submitting}
          className={`camp-btn-primary sticky bottom-3 mt-4 w-full px-4 py-3 text-base shadow-lg disabled:opacity-50 ${
            dirty && !submitting ? 'animate-pulse ring-4 ring-[var(--accent-glow)]' : ''
          }`}
        >
          {submitting
            ? 'Submitting…'
            : data.submission
              ? dirty
                ? 'Update attendance — unsaved changes'
                : 'Update attendance'
              : 'Submit attendance'}
        </button>
      ) : (
        <button
          onClick={() => clockHour !== null && setForcedHour(clockHour)}
          disabled={clockHour === null}
          className="camp-btn-primary sticky bottom-3 mt-4 w-full px-4 py-3 text-base shadow-lg disabled:opacity-50"
        >
          Force open attendance
        </button>
      )}

      {openReportRef !== null && (
        <StudentIncidentLayer
          token={token}
          refIndex={openReportRef}
          name={(() => {
            const r = data.roster.find((x) => x.ref === openReportRef);
            return r ? `${r.first_name} ${r.last_name}` : 'Student';
          })()}
          nowQuery={nowQuery}
          onClose={() => { setOpenReportRef(null); load(); }}
        />
      )}
    </main>
  );
}
