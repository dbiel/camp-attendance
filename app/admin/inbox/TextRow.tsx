'use client';

import Link from 'next/link';
import type { TextDoc, TextTag } from '@/lib/types';

/** Short relative-time label, e.g. "5m ago", "2h 3m ago", "3d ago". Exported for tests. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TAG_CHIP: Record<TextTag, string> = {
  camp: 'bg-amber-100 text-amber-800 border-amber-300',
  personal: 'bg-gray-100 text-gray-600 border-gray-300',
  unknown: 'bg-purple-100 text-purple-800 border-purple-300',
};

export function TextRow({
  t,
  onRetag,
  onDismiss,
}: {
  t: TextDoc;
  onRetag: (id: string, tag: TextTag) => void;
  onDismiss: (id: string) => void;
}) {
  const sender = t.sender_name || t.sender_handle;
  const escalated = !!t.escalated_case_id;

  return (
    <div className="camp-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{sender}</span>
          <span className="text-[11px] uppercase tracking-wide text-gray-400">{t.service}</span>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{relativeTime(t.sent_at)}</span>
      </div>

      <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">
        {t.decode_failed ? (
          <span className="italic text-gray-500">
            [could not decode message — check your phone]
          </span>
        ) : (
          t.body || <span className="italic text-gray-400">(no text)</span>
        )}
        {t.has_attachments && <span className="ml-1 text-xs text-gray-400">📎</span>}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs ${TAG_CHIP[t.tag]}`}>{t.tag}</span>
        {t.tag_reason && <span className="text-[11px] text-gray-400">{t.tag_reason}</span>}

        <span className="flex-1" />

        {escalated ? (
          <Link href={`/admin/cases/${t.escalated_case_id}`} className="camp-btn-outline px-2 py-1 text-xs">
            View Report
          </Link>
        ) : (
          // TODO(Plan C): wire to NewReport prefill + setTextEscalated(t.id, caseId).
          // For now this links to the cases page so the workflow is reachable.
          <Link
            href={`/admin/cases?from_text=${encodeURIComponent(t.id)}`}
            className="camp-btn-accent px-2 py-1 text-xs"
          >
            Escalate
          </Link>
        )}

        {t.tag !== 'camp' && (
          <button onClick={() => onRetag(t.id, 'camp')} className="camp-btn-outline px-2 py-1 text-xs">
            → Camp
          </button>
        )}
        {t.tag !== 'personal' && (
          <button
            onClick={() => onRetag(t.id, 'personal')}
            className="camp-btn-outline px-2 py-1 text-xs"
          >
            → Personal
          </button>
        )}
        <button onClick={() => onDismiss(t.id)} className="camp-btn-outline px-2 py-1 text-xs">
          Dismiss
        </button>
      </div>
    </div>
  );
}
