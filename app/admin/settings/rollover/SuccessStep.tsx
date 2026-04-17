'use client';

import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { RolloverResult } from './types';

export function SuccessStep({ result }: { result: RolloverResult }) {
  const { push: toast } = useToast();

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(result.new_camp_code);
      toast({ kind: 'info', text: 'Code copied to clipboard' });
    } catch {
      toast({ kind: 'error', text: 'Copy failed — select and copy manually' });
    }
  }

  return (
    <section className="camp-card p-6 border-2 border-green-500 bg-green-50">
      <h2 className="camp-subheading text-green-800">
        Rollover complete. Welcome to {result.new_id}.
      </h2>

      <dl className="space-y-3 text-sm text-gray-800 mb-6">
        <div>
          <dt className="font-semibold">Archived</dt>
          <dd>
            {result.archived.attendance} attendance records,{' '}
            {result.archived.session_students} session enrollments under{' '}
            <code>camps/{result.old_id}/</code>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Cleared live</dt>
          <dd>
            {result.cleared.attendance} attendance,{' '}
            {result.cleared.session_students} session enrollments
          </dd>
        </div>
        <div>
          <dt className="font-semibold mb-1">New camp code</dt>
          <dd className="flex flex-wrap items-center gap-3">
            <code className="text-2xl font-mono bg-gray-100 p-3 rounded tracking-wider">
              {result.new_camp_code}
            </code>
            <button
              type="button"
              className="camp-btn-outline px-4"
              onClick={copyCode}
            >
              Copy
            </button>
          </dd>
        </div>
      </dl>

      <div
        role="note"
        className="mb-6 rounded border border-green-300 bg-white p-3 text-sm text-gray-700"
      >
        Distribute this code to faculty. Teacher devices will need to re-enter
        it to reconnect.
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/admin/settings" className="camp-btn-outline px-6">
          Back to Settings
        </Link>
        <Link href="/admin/dashboard" className="camp-btn-primary px-6">
          Dashboard
        </Link>
      </div>
    </section>
  );
}
