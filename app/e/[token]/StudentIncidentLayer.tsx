'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';

interface Update { body: string; actor: string; created_at: string }
interface Incident {
  first_name: string; last_initial: string; instrument: string;
  report_summary: string; status: 'active' | 'resolved'; updates: Update[];
}

/** Pop-up layer on the ensemble roster: shows a flagged student's incident
 * timeline (scoped, no dorm) and a two-way "add update" box that posts back to
 * the office. Polls every 30s (pause-on-hidden) and flashes when the office
 * adds something. Mirrors /r. */
export function StudentIncidentLayer({
  token, refIndex, name, nowQuery, onClose,
}: { token: string; refIndex: number; name: string; nowQuery: string; onClose: () => void }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const prevCount = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/${token}/incident/${refIndex}${nowQuery}`);
      if (res.status === 429) return;
      if (!res.ok) { setInvalid(true); return; }
      const data = (await res.json()) as { incident: Incident };
      const count = data.incident.updates.length;
      if (prevCount.current !== null && count > prevCount.current) {
        setFlash(true);
        setTimeout(() => setFlash(false), 4000);
      }
      prevCount.current = count;
      setIncident(data.incident);
    } catch {
      setInvalid(true);
    }
  }, [token, refIndex, nowQuery]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const i = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => clearInterval(i);
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/e/${token}/incident/${refIndex}/update${nowQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) { setError('Could not send your update. Please try again.'); return; }
      setDraft('');
      await load();
    } catch {
      setError('Could not send your update. Please try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <Modal open title={name} onClose={onClose}>
      {flash && (
        <div className="mb-3 rounded bg-yellow-100 p-2 text-center text-sm text-yellow-900">
          ↻ Updated from the camp office
        </div>
      )}
      {invalid && <p className="text-sm text-[var(--text-3)]">No active incident for this student.</p>}
      {!invalid && !incident && <p className="text-sm text-[var(--text-3)]">Loading…</p>}
      {incident && (
        <div className="text-sm">
          <span
            className={
              incident.status === 'resolved'
                ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                : 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
            }
          >
            {incident.status === 'resolved' ? 'Resolved' : 'Active'}
          </span>
          <p className="mt-2 text-[var(--text)]">{incident.report_summary}</p>

          <h3 className="mt-4 text-sm font-semibold text-[var(--text-2)]">Timeline</h3>
          <ol className="mt-2 flex flex-col gap-2">
            {incident.updates.length === 0 && <li className="text-[var(--text-3)]">No updates yet.</li>}
            {incident.updates.map((u, i) => (
              <li key={i} className="rounded border-l-4 border-blue-400 bg-blue-50 p-2">
                <span className="text-xs text-[var(--text-3)]">
                  {new Date(u.created_at).toLocaleString()} · {u.actor}
                </span>
                <p className="whitespace-pre-wrap break-words">{u.body}</p>
              </li>
            ))}
          </ol>

          {incident.status === 'active' && (
            <div className="mt-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add an update for the camp office…"
                className="h-20 w-full rounded border p-2 text-sm"
              />
              {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
              <button
                onClick={send}
                disabled={posting || !draft.trim()}
                className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {posting ? 'Sending…' : 'Send update'}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
