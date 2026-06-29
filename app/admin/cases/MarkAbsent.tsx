'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentPicker, type Candidate } from './StudentPicker';
import { getTodayDate } from '@/lib/date';

interface Absence {
  id: string;
  student_name: string;
  date: string;
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

/** Office "mark a kid absent" control: a student + a clock window → POST; plus a
 * compact list of today's active office-absences with Clear. */
export function MarkAbsent({ getAuthHeaders }: { getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [date, setDate] = useState(getTodayDate());
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function save() {
    if (!selected || !date) return;
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
          date, all_day: allDay,
          ...(allDay ? {} : { from, until }),
          note: note.trim() || null,
        }),
      });
      if (!res.ok) { setError('Could not save. Please try again.'); return; }
      setSelected(null); setFrom(''); setUntil(''); setNote(''); setAllDay(false); setDate(getTodayDate());
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

      <label className="mt-2 block text-sm">
        Date
        <input type="date" aria-label="Date" value={date} min={getTodayDate()} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All-day
      </label>
      {!allDay && (
        <div className="mt-2 flex gap-3">
          <label className="text-sm">
            From
            <input type="time" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
          </label>
          <label className="text-sm">
            Until
            <input type="time" aria-label="Until" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
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
      <button
        onClick={save}
        disabled={busy || !selected || !date || (!allDay && (!from || !until))}
        className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save absence'}
      </button>

      <div className="mt-3 border-t border-[var(--glass-border)] pt-2">
        <h3 className="text-sm font-semibold text-[var(--text-2)]">Marked absent</h3>
        {absences.length === 0 && <p className="text-sm text-[var(--text-3)]">None.</p>}
        <ul className="mt-1 flex flex-col gap-1">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border border-[var(--glass-border)] px-2 py-1 text-sm">
              <span>{dayLabel(a.date, getTodayDate())} · {a.student_name} · {a.all_day ? 'All day' : `out ${a.from}–${a.until}`}{a.note ? ` · ${a.note}` : ''}</span>
              <button onClick={() => clear(a.id)} className="text-xs text-red-700 underline">Clear</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
