'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';

type TimelineKind = 'report' | 'note' | 'update' | 'resolved' | 'reopened';
interface TimelineEntry { kind: TimelineKind; label: string; body: string; actor: string; created_at: string }
interface Incident {
  first_name: string; last_initial: string; instrument: string;
  report_summary: string; status: 'active' | 'resolved';
  resolution_note: string | null; timeline: TimelineEntry[];
}

// Per-kind styling for the timeline rail.
const KIND_STYLE: Record<TimelineKind, string> = {
  report: 'border-red-400 bg-red-50',
  note: 'border-gray-300 bg-gray-50',
  update: 'border-blue-400 bg-blue-50',
  resolved: 'border-green-400 bg-green-50',
  reopened: 'border-amber-400 bg-amber-50',
};

/** Pop-up layer on the ensemble roster: shows a flagged student's report
 * timeline (scoped, no dorm/PII) and a two-way "add update" box that posts back
 * to the office. Polls every 30s (pause-on-hidden) and flashes when the office
 * adds something. On mobile, the phone/browser Back button closes this layer
 * (returns to the roster) instead of leaving the page for the ensemble picker —
 * we push a history entry on open and pop it on close. Mirrors /r. */
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

  // Browser/phone Back closes the layer (not the page). Push one history entry
  // on open; Back fires popstate → onClose. The close controls call back() so
  // every close path consumes that pushed entry and history stays balanced.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    window.history.pushState({ incidentLayer: true }, '');
    const onPop = () => closeRef.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const requestClose = useCallback(() => { window.history.back(); }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/${token}/incident/${refIndex}${nowQuery}`);
      if (res.status === 429) return;
      if (!res.ok) { setInvalid(true); return; }
      const data = (await res.json()) as { incident: Incident };
      const count = data.incident.timeline?.length ?? 0;
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

  const timeline = incident?.timeline ?? [];

  return (
    <Modal open title={name} onClose={requestClose}>
      {flash && (
        <div className="mb-3 rounded bg-yellow-100 p-2 text-center text-sm text-yellow-900">
          ↻ Updated from the camp office
        </div>
      )}
      {invalid && <p className="text-sm text-[var(--text-3)]">No report found for this student.</p>}
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

          <ol className="mt-3 flex flex-col gap-2">
            {timeline.length === 0 && (
              <li className="text-[var(--text-3)]">{incident.report_summary}</li>
            )}
            {timeline.map((t, i) => (
              <li key={i} className={`rounded border-l-4 p-2 ${KIND_STYLE[t.kind]}`}>
                <span className="text-xs font-semibold text-[var(--text-2)]">{t.label}</span>
                <span className="text-xs text-[var(--text-3)]">
                  {' · '}{new Date(t.created_at).toLocaleString()}{t.actor ? ` · ${t.actor}` : ''}
                </span>
                <p className="whitespace-pre-wrap break-words text-[var(--text)]">{t.body}</p>
              </li>
            ))}
          </ol>

          {incident.status === 'resolved' && incident.resolution_note && timeline.every((t) => t.kind !== 'resolved') && (
            <p className="mt-2 text-sm text-green-700">Resolved — {incident.resolution_note}</p>
          )}

          {incident.status === 'active' && (
            <div className="mt-4">
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
