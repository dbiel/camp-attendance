'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ReportHistory } from '../ReportHistory';

export default function CaseHistory() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 text-xl font-bold">Report History</h1>
      <ReportHistory defaultStatus="all" />
    </main>
  );
}
