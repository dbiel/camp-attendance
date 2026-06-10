'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import { CaseCard } from './CaseCard';
import { NewReport } from './NewReport';

export default function ActiveCases() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cases?status=active', { headers });
      if (res.ok) setCases((await res.json()).cases as Case[]);
    } catch {
      // Offline / transient network error — keep the last known list.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  if (authLoading || !user) return null;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Active Cases</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/cases/history" className="text-red-700 underline">History</Link>
          <Link href="/admin/coverage" className="text-gray-500 underline">Coverage</Link>
          <Link href="/admin/settings" className="text-gray-500 underline">Settings</Link>
          <button onClick={signOut} className="text-gray-500 underline">Sign out</button>
        </nav>
      </header>

      <NewReport onCreated={refresh} />

      <section className="mt-4 flex flex-col gap-2">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && cases.length === 0 && (
          <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            No active cases. 🎺
          </p>
        )}
        {cases.map((c) => <CaseCard key={c.id} c={c} />)}
      </section>
    </main>
  );
}
