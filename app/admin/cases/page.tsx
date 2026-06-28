'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import type { TextDoc } from '@/lib/types';
import { CaseCard } from './CaseCard';
import { NewReport } from './NewReport';
import { SelectionBar } from './SelectionBar';

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
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedText, setSeedText] = useState<string | undefined>(undefined);
  const [seedReady, setSeedReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cases?status=active', { headers });
      if (res.ok) {
        const list = (await res.json()).cases as Case[];
        setCases(list);
        // Drop selections for reports that left the active list (e.g. resolved)
        // so a stale id can't ride into a Phase-5 combined link.
        setSelected((prev) => new Set([...prev].filter((id) => list.some((c) => c.id === id))));
      }
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
    // Poll every 30s, but skip ticks while the tab is hidden (saves battery /
    // reads on a phone in a pocket); refresh immediately on regaining focus.
    const interval = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30_000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
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

  // Flat list, MOST URGENT FIRST (longest elapsed = oldest occurred_at). Never
  // collapsed — auto-hiding a still-missing kid would be a safety bug.
  const sorted = [...cases].sort(
    (a, b) =>
      new Date(a.occurred_at || a.created_at).getTime() -
      new Date(b.occurred_at || b.created_at).getTime()
  );
  const selectedCount = sorted.filter((c) => selected.has(c.id)).length;
  const newOpen = showNew || Boolean(fromText);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Active Reports</h1>
        {!newOpen && (
          <button type="button" onClick={() => setShowNew(true)} className="camp-btn-primary px-3 py-1.5 text-sm">
            + New report
          </button>
        )}
      </header>

      {seedReady && newOpen && (
        <NewReport
          key={fromText ?? 'new'}
          onCreated={() => {
            setShowNew(false);
            // Strip ?from_text so a Back-nav can't re-seed and double-file.
            if (fromText) router.replace('/admin/cases');
            refresh();
          }}
          onCancel={() => {
            setShowNew(false);
            if (fromText) router.replace('/admin/cases');
          }}
          seedText={seedText}
          sourceTextId={fromText ?? undefined}
        />
      )}

      <section className="mt-4 flex flex-col gap-2">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && sorted.length === 0 && (
          <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            No active reports. 🎺
          </p>
        )}
        {sorted.map((c) => (
          <CaseCard key={c.id} c={c} selected={selected.has(c.id)} onToggleSelect={toggleSelect} />
        ))}
      </section>

      <SelectionBar count={selectedCount} onClear={() => setSelected(new Set())} />
    </main>
  );
}
