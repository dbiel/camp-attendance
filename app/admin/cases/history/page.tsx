'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';

export default function CaseHistory() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const fetchCases = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cases?status=resolved', { headers });
      if (res.ok) {
        setCases((await res.json()).cases as Case[]);
      } else {
        setLoadError(`Failed to load history (${res.status})`);
      }
    } catch {
      setLoadError('Failed to load — tap to retry.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user) fetchCases();
  }, [user, fetchCases]);

  if (loadError && cases.length === 0) {
    return (
      <main className="p-4 text-sm text-gray-500">
        <p>{loadError}</p>
        <button onClick={fetchCases} className="mt-2 rounded border px-3 py-1 text-sm">
          Retry
        </button>
      </main>
    );
  }

  if (loading && cases.length === 0) {
    return <main className="p-4 text-sm text-gray-500">Loading…</main>;
  }

  if (authLoading || !user) return null;

  const visible = cases.filter((c) =>
    c.student_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold">Report History</h1>
      <label className="mt-2 block">
        <span className="sr-only">Filter by student name</span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by student name…"
          className="w-full rounded border p-2 text-sm"
        />
      </label>
      <ul className="mt-3 flex flex-col gap-2">
        {visible.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/cases/${c.id}`}
              className="block rounded border bg-white p-3 text-sm hover:bg-gray-50"
            >
              <div className="flex justify-between">
                <span className="font-medium">{c.student_name}</span>
                <span className="text-gray-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-gray-700">{c.summary}</p>
              {c.resolution_note && (
                <p className="text-green-700">→ {c.resolution_note}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">
          {cases.length > 0 ? 'No matches.' : 'No resolved reports.'}
        </p>
      )}
    </main>
  );
}
