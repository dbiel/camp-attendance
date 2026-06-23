'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface StaffUpdate {
  body: string;
  actor: string;
  created_at: string;
}

interface Projection {
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
  | { kind: 'ready'; data: Projection };

export default function StaffLinkViewer() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/r/${token}`);
      if (!res.ok) {
        setState({ kind: 'invalid' });
        return;
      }
      const data = (await res.json()) as Projection;
      setState({ kind: 'ready', data });
    } catch {
      setState({ kind: 'invalid' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function postUpdate() {
    if (!draft.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/r/${token}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (res.status === 410) {
        setState({ kind: 'invalid' });
        return;
      }
      if (!res.ok) {
        setPostError('Could not send your update. Please try again.');
        return;
      }
      setDraft('');
      await load();
    } catch {
      setPostError('Could not send your update. Please try again.');
    } finally {
      setPosting(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <main className="mx-auto max-w-md p-6 text-center text-sm text-gray-500">Loading…</main>
    );
  }

  if (state.kind === 'invalid') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-800">This link has expired</h1>
        <p className="text-sm text-gray-600">
          Staff links are valid for a limited time. Please ask for a new link if you still need it.
        </p>
      </main>
    );
  }

  const d = state.data;
  const fullName = `${d.first_name} ${d.last_initial}`.trim();

  return (
    <main className="mx-auto max-w-md p-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">{fullName}</h1>
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
      </section>

      {d.status === 'resolved' && (
        <p className="mt-3 rounded bg-green-50 p-2 text-center text-sm text-green-800">
          This report has been resolved. Thank you for your help!
        </p>
      )}

      <section className="mt-4">
        <h2 className="text-sm font-semibold text-gray-700">Updates</h2>
        <ol className="mt-2 flex flex-col gap-2">
          {d.updates.length === 0 && (
            <li className="text-sm text-gray-500">No updates yet.</li>
          )}
          {d.updates.map((u, i) => (
            <li key={i} className="rounded border-l-4 border-blue-400 bg-blue-50 p-2 text-sm">
              <span className="text-xs text-gray-500">
                {new Date(u.created_at).toLocaleString()} · {u.actor}
              </span>
              <p className="whitespace-pre-wrap break-words">{u.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {d.status === 'active' && (
        <section className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an update for the camp office…"
            className="h-24 w-full rounded border p-2 text-sm"
          />
          {postError && <p className="mt-1 text-sm text-red-600">{postError}</p>}
          <button
            onClick={postUpdate}
            disabled={posting || !draft.trim()}
            className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {posting ? 'Sending…' : 'Send update'}
          </button>
        </section>
      )}
    </main>
  );
}
