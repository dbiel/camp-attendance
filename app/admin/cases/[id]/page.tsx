'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case, CaseEvent } from '@/lib/cases';
import type { Student } from '@/lib/types';
import type { Contact } from '@/lib/contacts';
import { renderTemplate, smsHref, DEFAULT_TEMPLATES, type MessageTemplates } from '@/lib/messages-shared';

interface Detail {
  case: Case;
  events: CaseEvent[];
  student: Student | null;
  prior_cases: Case[];
}

export default function CaseDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [dormStaff, setDormStaff] = useState<Contact[]>([]);
  const [resolveNote, setResolveNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const [dres, tres, cres] = await Promise.all([
        fetch(`/api/cases/${params.id}`, { headers }),
        fetch('/api/config/templates', { headers }),
        fetch('/api/contacts', { headers }),
      ]);
      if (dres.ok) setDetail(await dres.json());
      else setLoadError(`Failed to load case (${dres.status})`);
      if (tres.ok) setTemplates((await tres.json()).templates);
      if (cres.ok) setDormStaff(((await cres.json()).contacts as Contact[]).filter((c) => c.role === 'dorm_staff'));
    } catch {
      setLoadError('Failed to load — tap to retry.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function logEvent(type: 'parent_texted' | 'dorm_staff_texted' | 'note', body: string) {
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      await fetch(`/api/cases/${params.id}/events`, { method: 'POST', headers, body: JSON.stringify({ type, body }) });
      refresh();
    } catch {
      // Fire-and-forget: timeline will just miss the entry on network error.
    }
  }

  async function resolve() {
    setResolveError(null);
    setResolving(true);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/cases/${params.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ resolution_note: resolveNote }),
      });
      if (res.ok) {
        router.push('/admin/cases');
      } else {
        const data = await res.json().catch(() => ({}));
        setResolveError(data?.error ?? `Failed to resolve (${res.status})`);
      }
    } catch {
      setResolveError('Network error — please try again.');
    } finally {
      setResolving(false);
    }
  }

  if (loadError && !detail) {
    return (
      <main className="p-4 text-sm text-gray-500">
        <p>{loadError}</p>
        <button onClick={refresh} className="mt-2 rounded border px-3 py-1 text-sm">Retry</button>
      </main>
    );
  }

  if (!detail || !user) return <main className="p-4 text-sm text-gray-500">Loading…</main>;
  const { case: c, student, events, prior_cases } = detail;

  const vars = {
    kid_first: student?.preferred_name || student?.first_name || '',
    kid_name: c.student_name,
    parent_first: student?.parent_first_name || '',
    session: c.session_label || 'class',
    dorm_building: student?.dorm_building || '',
    dorm_room: student?.dorm_room || '',
  };
  const parentBody = renderTemplate(templates.parent, vars);
  const dormBody = renderTemplate(templates.dorm_staff, vars);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link href="/admin/cases" className="text-sm text-red-700 underline">← Active cases</Link>
      <h1 className="mt-2 text-xl font-bold">{c.student_name}</h1>
      <p className="text-sm text-gray-600">{c.summary}{c.session_label ? ` — ${c.session_label}` : ''}</p>
      {c.status === 'resolved' && (
        <p className="mt-2 rounded bg-green-50 p-2 text-sm text-green-800">Resolved: {c.resolution_note}</p>
      )}

      {student && (
        <section className="mt-4 rounded border bg-white p-3 text-sm">
          <p><span className="font-medium">Dorm:</span> {student.dorm_building || 'Commuter'} {student.dorm_room || ''}</p>
          <p><span className="font-medium">Parent:</span> {student.parent_first_name} {student.parent_last_name} {student.parent_phone}</p>
          <p><span className="font-medium">Kid cell:</span> {student.cell_phone || '—'}</p>
          <p><span className="font-medium">Ensemble:</span> {student.ensemble} ({student.instrument})</p>
          {student.medical_notes && <p className="text-red-700"><span className="font-medium">Medical:</span> {student.medical_notes}</p>}
          {prior_cases.length > 0 && (
            <p className="mt-1 text-amber-700">⚠ {prior_cases.length} prior incident{prior_cases.length > 1 ? 's' : ''}</p>
          )}
        </section>
      )}

      {c.status === 'active' && (
        <section className="mt-4 flex flex-col gap-2">
          {student?.parent_phone && (
            <SmsAction
              label={student.parent_first_name ? `Text parent (${student.parent_first_name})` : 'Text parent'}
              href={smsHref(student.parent_phone, parentBody)}
              body={parentBody}
              onSent={() => logEvent('parent_texted', `Texted parent ${student.parent_phone}`)}
            />
          )}
          <DormStaffAction staff={dormStaff} body={dormBody} onSent={(name) => logEvent('dorm_staff_texted', `Texted dorm staff ${name}`)} />
          <button onClick={() => setShowResolve(true)} className="rounded bg-green-700 px-4 py-2 text-left text-white">
            ✓ Resolve case
          </button>
          {showResolve && (
            <div className="rounded border p-3">
              <input
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Where/how was the kid found?"
                className="w-full rounded border p-2 text-sm"
              />
              {resolveError && (
                <p className="mt-1 text-sm text-red-700">{resolveError}</p>
              )}
              <button
                onClick={resolve}
                disabled={!resolveNote.trim() || resolving}
                className="mt-2 rounded bg-green-700 px-4 py-1 text-white disabled:opacity-50"
              >
                {resolving ? 'Saving…' : 'Confirm resolve'}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="rounded border-l-4 border-gray-300 bg-white p-2">
              <span className="text-xs text-gray-500">{new Date(e.created_at).toLocaleTimeString()} · {e.actor}</span>
              <p>{e.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function SmsAction({ label, href, body, onSent }: { label: string; href: string; body: string; onSent: () => void }) {
  const [copyError, setCopyError] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <a href={href} onClick={onSent} className="flex-1 rounded bg-red-700 px-4 py-2 text-white">📱 {label}</a>
      <button
        onClick={() => {
          setCopyError(false);
          const write = navigator.clipboard?.writeText(body);
          if (!write) {
            setCopyError(true);
            return;
          }
          write.then(onSent).catch(() => setCopyError(true));
        }}
        className="rounded border px-3 py-2 text-sm"
        title="Copy message"
      >
        Copy
      </button>
      {copyError && <span className="text-xs text-red-700">Copy unavailable</span>}
    </div>
  );
}

function DormStaffAction({ staff, body, onSent }: { staff: Contact[]; body: string; onSent: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  if (staff.length === 0) {
    return <p className="rounded border border-dashed p-2 text-sm text-gray-500">No dorm staff contacts yet — add them in Settings.</p>;
  }
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full rounded bg-red-700 px-4 py-2 text-left text-white">
        🏠 Text dorm staff…
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {staff.map((s) => (
            <a key={s.id} href={smsHref(s.phone, body)} onClick={() => onSent(s.name)} className="rounded border p-2 text-sm">
              {s.name} {s.dorm_building ? `(${s.dorm_building})` : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
