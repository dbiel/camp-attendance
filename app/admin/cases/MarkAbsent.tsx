'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentPicker, type Candidate } from './StudentPicker';
import { getTodayDate, getCurrentTimeHHMM } from '@/lib/date';

interface Absence {
  id: string;
  student_name: string;
  date: string;
  end_date?: string;
  all_day: boolean;
  from: string;
  until: string;
  note: string | null;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Range label: "Today" for a single day, "Today → Wed Jul 2" across days. */
function rangeLabel(date: string, endDate: string | undefined, today: string): string {
  const start = dayLabel(date, today);
  if (!endDate || endDate === date) return start;
  return `${start} → ${dayLabel(endDate, today)}`;
}

/** Whole-hour helpers — the office only cares about the hour (minutes ignored). */
function hourFloor(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:00`;
}
function nextHour(hhmm: string): string {
  const h = Math.min(parseInt(hhmm.slice(0, 2), 10) + 1, 23);
  return `${String(h).padStart(2, '0')}:00`;
}

/** Office "mark a kid absent" control: a student + a date range + a clock window
 * → POST; a "Remove from camp" action that withdraws the student; plus a compact
 * list of upcoming office-absences with Clear. */
export function MarkAbsent({ getAuthHeaders }: { getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [date, setDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());
  const [allDay, setAllDay] = useState(false);
  // Default the window to the current whole hour (e.g. 10:32 → 10:00–11:00).
  const [from, setFrom] = useState(() => hourFloor(getCurrentTimeHHMM()));
  const [until, setUntil] = useState(() => nextHour(getCurrentTimeHHMM()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remove-from-camp (reversible withdraw) state.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removedMsg, setRemovedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/marked-absences', { headers });
      if (res.ok) setAbsences(((await res.json()).absences as Absence[]) ?? []);
    } catch {
      /* transient */
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Selecting a different student resets the remove-confirm + any prior notice.
  useEffect(() => {
    setConfirmRemove(false);
    setRemovedMsg(null);
  }, [selected?.id]);

  // Keep the end date from drifting before the start.
  function changeStart(v: string) {
    setDate(v);
    if (endDate < v) setEndDate(v);
  }

  async function save() {
    if (!selected || !date) return;
    if (endDate < date) { setError('End date must be on or after the start date.'); return; }
    if (!allDay && (!from || !until)) return;
    if (!allDay && from >= until) { setError('"Until" must be after "From".'); return; }
    setBusy(true);
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/marked-absences', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: selected.id, student_name: selected.name,
          date, end_date: endDate, all_day: allDay,
          // Snap to whole hours — minutes are ignored by design.
          ...(allDay ? {} : { from: hourFloor(from), until: hourFloor(until) }),
          note: note.trim() || null,
        }),
      });
      if (!res.ok) { setError('Could not save. Please try again.'); return; }
      setSelected(null); setAllDay(false);
      setDate(getTodayDate()); setEndDate(getTodayDate());
      setFrom(hourFloor(getCurrentTimeHHMM())); setUntil(nextHour(getCurrentTimeHHMM()));
      setNote('');
      await load();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function clear(id: string) {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/marked-absences/${id}`, { method: 'DELETE', headers });
      await load();
    } catch {
      /* transient */
    }
  }

  // Reversible "Remove from camp": flag the student withdrawn so they drop off
  // every roster/picker/attendance roll. Restore them from Data ▸ Students.
  async function removeFromCamp() {
    if (!selected) return;
    setRemoveBusy(true);
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/students/${selected.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ withdrawn: true }),
      });
      if (!res.ok) { setError('Could not remove from camp. Please try again.'); return; }
      setRemovedMsg(`${selected.name} removed from camp. Restore them in Data ▸ Students.`);
      setSelected(null);
      setConfirmRemove(false);
    } catch {
      setError('Could not remove from camp. Please try again.');
    } finally {
      setRemoveBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="camp-btn-outline px-3 py-1.5 text-sm">
        Mark absent
      </button>
    );
  }

  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Mark a student absent (office)</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-[var(--text-3)]">Close</button>
      </div>

      <div className="mt-2">
        <StudentPicker
          candidates={[]}
          value={selected?.id ?? ''}
          selected={selected}
          onChange={setSelected}
          getAuthHeaders={getAuthHeaders}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        <label className="block text-sm">
          Start date
          <input type="date" aria-label="Start date" value={date} min={getTodayDate()} onChange={(e) => changeStart(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
        </label>
        <label className="block text-sm">
          End date
          <input type="date" aria-label="End date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
        </label>
      </div>
      {endDate > date && (
        <p className="mt-1 text-xs text-[var(--text-3)]">Absent each day {rangeLabel(date, endDate, getTodayDate())}.</p>
      )}
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All-day
      </label>
      {!allDay && (
        <div className="mt-2 flex gap-3">
          <label className="text-sm">
            From
            <input type="time" step={3600} aria-label="From" value={from} onChange={(e) => setFrom(hourFloor(e.target.value))} className="mt-1 block rounded border p-1.5 text-sm" />
          </label>
          <label className="text-sm">
            Until
            <input type="time" step={3600} aria-label="Until" value={until} onChange={(e) => setUntil(hourFloor(e.target.value))} className="mt-1 block rounded border p-1.5 text-sm" />
          </label>
        </div>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason (optional) — e.g. doctor appt"
        className="mt-2 w-full rounded border p-2 text-sm"
      />
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      {removedMsg && <p className="mt-1 text-sm text-green-700">{removedMsg}</p>}
      <button
        onClick={save}
        disabled={busy || !selected || !date || endDate < date || (!allDay && (!from || !until))}
        className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save absence'}
      </button>

      {/* Reversible "Remove from camp" — withdraws the picked student entirely. */}
      {selected && (
        <div className="mt-3 border-t border-[var(--glass-border)] pt-2">
          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              Remove {selected.name} from camp
            </button>
          ) : (
            <div className="rounded border border-red-300 bg-red-50 p-2">
              <p className="text-sm text-red-800">
                Remove <span className="font-semibold">{selected.name}</span> from camp? They drop off every roster,
                picker and attendance roll. You can restore them in Data ▸ Students.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={removeFromCamp}
                  disabled={removeBusy}
                  className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {removeBusy ? 'Removing…' : 'Confirm remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="rounded border px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-[var(--glass-border)] pt-2">
        <h3 className="text-sm font-semibold text-[var(--text-2)]">Marked absent</h3>
        {absences.length === 0 && <p className="text-sm text-[var(--text-3)]">None.</p>}
        <ul className="mt-1 flex flex-col gap-1">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border border-[var(--glass-border)] px-2 py-1 text-sm">
              <span>{rangeLabel(a.date, a.end_date, getTodayDate())} · {a.student_name} · {a.all_day ? 'All day' : `out ${a.from}–${a.until}`}{a.note ? ` · ${a.note}` : ''}</span>
              <button onClick={() => clear(a.id)} className="text-xs text-red-700 underline">Clear</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
