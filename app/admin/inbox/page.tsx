'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import type { TextDoc, TextTag } from '@/lib/types';
import { TextRow } from './TextRow';

type Filter = 'camp' | 'personal' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'camp', label: 'Camp' },
  { key: 'personal', label: 'Personal' },
  { key: 'all', label: 'All' },
];

export default function Inbox() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { push: toast } = useToast();
  const [filter, setFilter] = useState<Filter>('camp');
  const [texts, setTexts] = useState<TextDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const qs = filter === 'all' ? '' : `?tag=${filter}`;
      const res = await fetch(`/api/texts${qs}`, { headers });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.ok) {
        setForbidden(false);
        setTexts((await res.json()).texts as TextDoc[]);
      }
    } catch {
      // Transient network error — keep the last known list.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  const handleRetag = useCallback(
    async (id: string, tag: TextTag) => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/texts/${id}`, {
          method: 'PATCH',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ tag }),
        });
        if (!res.ok) throw new Error();
        toast({ kind: 'success', text: `Re-tagged as ${tag}` });
        refresh();
      } catch {
        toast({ kind: 'error', text: 'Re-tag failed' });
      }
    },
    [getAuthHeaders, refresh, toast]
  );

  const handleDismiss = useCallback(
    async (id: string) => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/texts/${id}`, { method: 'DELETE', headers });
        if (!res.ok) throw new Error();
        setTexts((prev) => prev.filter((t) => t.id !== id));
        toast({ kind: 'success', text: 'Dismissed' });
      } catch {
        toast({ kind: 'error', text: 'Dismiss failed' });
      }
    },
    [getAuthHeaders, toast]
  );

  if (authLoading || !user) return null;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Inbox</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/dashboard" className="text-gray-500 underline">
            Dashboard
          </Link>
          <Link href="/admin/cases" className="text-gray-500 underline">
            Cases
          </Link>
        </nav>
      </header>

      {forbidden ? (
        <p className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          The inbox is restricted to super admins.
        </p>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key ? 'camp-btn-primary px-3 py-1 text-sm' : 'camp-btn-outline px-3 py-1 text-sm'
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          <section className="flex flex-col gap-2">
            {loading && <p className="text-sm text-gray-500">Loading…</p>}
            {!loading && texts.length === 0 && (
              <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No {filter === 'all' ? '' : filter} messages.
              </p>
            )}
            {texts.map((t) => (
              <TextRow key={t.id} t={t} onRetag={handleRetag} onDismiss={handleDismiss} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
