'use client';

import Link from 'next/link';
import type { Case } from '@/lib/cases';

function elapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function CaseCard({ c }: { c: Case }) {
  return (
    <Link
      href={`/admin/cases/${c.id}`}
      className="block rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm hover:bg-amber-100"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold">{c.student_name}</span>
        <span className="text-sm text-gray-600">{elapsed(c.created_at)} ago</span>
      </div>
      <p className="mt-1 text-sm text-gray-800">{c.summary}</p>
      {c.session_label && <p className="text-xs text-gray-500">{c.session_label}</p>}
      {c.reporter_name && <p className="mt-1 text-xs text-gray-500">Reported by {c.reporter_name}</p>}
    </Link>
  );
}
