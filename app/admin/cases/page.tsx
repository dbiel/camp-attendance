'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import type { TextDoc } from '@/lib/types';
import { CaseCard } from './CaseCard';
import { NewReport } from './NewReport';

// useSearchParams() requires a Suspense boundary in Next 14 App Router so the
// page can statically render its shell; the inner component reads ?from_text.
export default function ActiveCasesPage() {
  return (
    <Suspense fallback={null}>
      <ActiveCases />
    </Suspense>
  );
}

function ActiveCases() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromText = searchParams.get('from_text');
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedText, setSeedText] = useState<string | undefined>(undefined);
  const [seedReady, setSeedReady] = useState(false);

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

  // Escalation from the inbox: look up the originating text's body to seed the
  // NewReport auto-parse. We only need this once when arriving via ?from_text.
  useEffect(() => {
    if (!user || !fromText) {
      setSeedReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/texts?tag=all', { headers });
        if (res.ok) {
          const texts = (await res.json()).texts as TextDoc[];
          const t = texts.find((x) => x.id === fromText);
          if (!cancelled && t) setSeedText(t.body);
        }
      } catch {
        // If the lookup fails, fall back to an empty New report form.
      } finally {
        if (!cancelled) setSeedReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fromText]);

  if (authLoading || !user) return null;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Active Reports</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/cases/history" className="text-red-700 underline">History</Link>
          <Link href="/admin/coverage" className="text-gray-500 underline">Coverage</Link>
          <Link href="/admin/settings" className="text-gray-500 underline">Settings</Link>
          <button onClick={signOut} className="text-gray-500 underline">Sign out</button>
        </nav>
      </header>

      {seedReady && (
        <NewReport
          key={fromText ?? 'new'}
          onCreated={refresh}
          seedText={seedText}
          sourceTextId={fromText ?? undefined}
        />
      )}

      <section className="mt-4 flex flex-col gap-2">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && cases.length === 0 && (
          <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            No active reports. 🎺
          </p>
        )}
        {cases.map((c) => <CaseCard key={c.id} c={c} />)}
      </section>
    </main>
  );
}
