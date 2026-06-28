'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface StaffUpdate {
  body: string;
  actor: string;
  created_at: string;
}

interface Report {
  ref: number; // opaque index into the link's case set, echoed back on update
  first_name: string;
  last_initial: string;
  instrument: string;
  dorm_room: string;
  report_summary: string;
  status: 'active' | 'resolved';
  updates: StaffUpdate[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; reports: Report[] };

export default function StaffLinkViewer() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [postingRef, setPostingRef] = useState<number | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/r/${token}`);
      if (res.status === 429) return; // transient throttle — keep state, retry on next poll
      if (!res.ok) {
        setState({ kind: 'invalid' });
        return;
      }
      const body = (await res.json()) as { reports: Report[] };
      setState({ kind: 'ready', reports: body.reports ?? [] });
    } catch {
      setState({ kind: 'invalid' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll so resolutions/updates from the office appear; pause when backgrounded.
  useEffect(() => {
    const i = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    return () => clearInterval(i);
  }, [load]);

  async function postUpdate(ref: number) {
    const draft = (drafts[ref] ?? '').trim();
    if (!draft) return;
    setPostingRef(ref);
    setPostError(null);
    try {
      const res = await fetch(`/api/r/${token}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft, ref }),
      });
      if (res.status === 410) {
        setState({ kind: 'invalid' });
        return;
      }
      if (!res.ok) {
        setPostError('Could not send your update. Please try again.');
        return;
      }
      setDrafts((p) => ({ ...p, [ref]: '' }));
      await load();
    } catch {
      setPostError('Could not send your update. Please try again.');
    } finally {
      setPostingRef(null);
    }
  }

  if (state.kind === 'loading') {
    return <main className="mx-auto max-w-md p-6 text-center text-sm text-gray-500">Loading…</main>;
  }

  if (state.kind === 'invalid') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-800">This link is no longer active</h1>
        <p className="text-sm text-gray-600">
          The report may have been resolved, or the link expired. Please ask the camp office for a new link if you still need it.
        </p>
      </main>
    );
  }

  const reports = state.reports;

  return (
    <main className="mx-auto max-w-md p-4">
      {reports.length > 1 && (
        <h1 className="mb-3 text-lg font-bold">{reports.length} students to locate</h1>
      )}
      <div className="flex flex-col gap-4">
        {reports.map((d) => {
          const fullName = `${d.first_name} ${d.last_initial}`.trim();
          return (
            <section key={d.ref} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold">{fullName}</h2>
                <span
                  className={
                    d.status === 'resolved'
                      ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                      : 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
                  }
                >
                  {d.status === 'resolved' ? 'Resolved' : 'Active'}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-800">{d.report_summary}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Instrument</dt>
                  <dd>{d.instrument || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Dorm room</dt>
                  <dd>{d.dorm_room || '—'}</dd>
                </div>
              </dl>

              {d.status === 'resolved' && (
                <p className="mt-3 rounded bg-green-50 p-2 text-center text-sm text-green-800">
                  This student has been resolved. Thank you!
                </p>
              )}

              <div className="mt-3">
                <h3 className="text-sm font-semibold text-gray-700">Updates</h3>
                <ol className="mt-2 flex flex-col gap-2">
                  {d.updates.length === 0 && <li className="text-sm text-gray-500">No updates yet.</li>}
                  {d.updates.map((u, i) => (
                    <li key={i} className="rounded border-l-4 border-blue-400 bg-blue-50 p-2 text-sm">
                      <span className="text-xs text-gray-500">
                        {new Date(u.created_at).toLocaleString()} · {u.actor}
                      </span>
                      <p className="whitespace-pre-wrap break-words">{u.body}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {d.status === 'active' && (
                <div className="mt-3">
                  <textarea
                    value={drafts[d.ref] ?? ''}
                    onChange={(e) => setDrafts((p) => ({ ...p, [d.ref]: e.target.value }))}
                    placeholder="Add an update for the camp office…"
                    className="h-20 w-full rounded border p-2 text-sm"
                  />
                  <button
                    onClick={() => postUpdate(d.ref)}
                    disabled={postingRef === d.ref || !(drafts[d.ref] ?? '').trim()}
                    className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                  >
                    {postingRef === d.ref ? 'Sending…' : 'Send update'}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {postError && <p className="mt-3 text-center text-sm text-red-600">{postError}</p>}
    </main>
  );
}
