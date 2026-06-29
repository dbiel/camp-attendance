'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PickerItem {
  ensemble: string;
  token: string;
  count: number;
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; items: PickerItem[] };

/**
 * Shared picker page. One link to hand out: choose an ensemble, then jump to
 * that ensemble's existing `/e/<token>` attendance page. A `?now=HH:MM` test
 * override on this URL is forwarded onto the per-ensemble link.
 */
export default function EnsemblePickerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<State>({ kind: 'loading' });

  const nowQuery =
    typeof window !== 'undefined' && /[?&]now=\d{1,2}:\d{2}/.test(window.location.search)
      ? `?now=${new URLSearchParams(window.location.search).get('now')}`
      : '';

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/pick/${token}`);
      if (!res.ok) {
        setState({ kind: 'invalid' });
        return;
      }
      const data = (await res.json()) as { items: PickerItem[] };
      setState({ kind: 'ready', items: data.items ?? [] });
    } catch {
      setState({ kind: 'invalid' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold text-[var(--text)]">Take attendance</h1>
      <p className="text-sm text-[var(--text-2)]">Choose your ensemble.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {state.items.map((it) => (
          <li key={it.ensemble}>
            <a
              href={`/e/${it.token}${nowQuery}`}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface)] px-4 py-3 font-semibold text-[var(--text)]"
            >
              <span>{it.ensemble}</span>
              <span className="text-xs text-[var(--text-3)]">{it.count} students</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
