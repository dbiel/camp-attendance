'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AttendanceHistoryView } from './AttendanceHistoryView';

export default function AttendanceDataPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-3 text-xl font-bold">Attendance History</h1>
      <AttendanceHistoryView />
    </main>
  );
}
