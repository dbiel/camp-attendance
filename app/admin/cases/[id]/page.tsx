'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case, CaseEvent } from '@/lib/cases';
import type { Student } from '@/lib/types';
import type { Contact } from '@/lib/contacts';
import { renderTemplate, smsHref, DEFAULT_TEMPLATES, type MessageTemplates } from '@/lib/messages-shared';
import { currentAndNextSession, formatNextLabel, type ScheduleSlot } from '@/lib/schedule';
import { getCurrentTimeHHMM } from '@/lib/date';
import { markSeen } from '@/lib/seen';
import { AddTimelineNote } from './AddTimelineNote';

/** Live timeline refresh cadence while a report is active (paused when the tab
 * is backgrounded, stopped once resolved). */
const POLL_MS = 15_000;

/** Read the ?now=HH:MM clock override (testing) straight from the URL — keeps
 * parity with the hub + Students table without a Suspense boundary. */
function nowOverrideFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('now');
  return v && /^\d{1,2}:\d{2}$/.test(v) ? v : undefined;
}

type PriorCase = Case & { events: CaseEvent[] };

interface Detail {
  case: Case;
  events: CaseEvent[];
  student: Student | null;
  prior_cases: PriorCase[];
}

export default function CaseDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [dormStaff, setDormStaff] = useState<Contact[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Ticks every 30s so the now/next line advances with the wall clock even
  // without a fresh fetch.
  const [, setClock] = useState(0);

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

  // Lightweight poll: re-fetch ONLY the case (timeline + status), not the static
  // templates/contacts. Lets staff-link updates and an office-side resolve appear
  // without a manual reload. Pauses when backgrounded; stops once resolved.
  const refreshDetail = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/cases/${params.id}`, { headers });
      if (res.ok) setDetail(await res.json());
    } catch {
      // transient — the next tick will retry
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!user || detail?.case.status === 'resolved') return;
    const i = setInterval(() => {
      if (!document.hidden) refreshDetail();
    }, POLL_MS);
    return () => clearInterval(i);
  }, [user, detail?.case.status, refreshDetail]);

  // Fetch the student's schedule slots (ensemble base + electives) so we can show
  // where they should be now / next — the most actionable info for locating a kid.
  // Skipped for unmatched ("No student found") reports.
  useEffect(() => {
    const sid = detail?.case.student_id;
    if (!sid) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/students/${sid}/schedule?format=slots`, { headers });
        if (res.ok && !cancelled) setSlots(((await res.json()).slots as ScheduleSlot[]) ?? []);
      } catch {
        // schedule is a nicety — ignore transient failures
      }
    })();
    return () => { cancelled = true; };
  }, [detail?.case.student_id, getAuthHeaders]);

  // Advance the now/next line with the clock.
  useEffect(() => {
    const t = setInterval(() => setClock((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Opening (or live-updating while open) marks this report seen → clears its
  // "new" badge on the hub/history. Keyed on activity so a fresh poll re-clears.
  useEffect(() => {
    if (detail?.case) markSeen(detail.case);
  }, [detail?.case]);

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
        body: JSON.stringify({ resolution_note: resolveNote.trim() || 'Resolved' }),
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
      <main className="p-4 text-sm text-[var(--text-3)]">
        <p>{loadError}</p>
        <button onClick={refresh} className="mt-2 rounded border px-3 py-1 text-sm">Retry</button>
      </main>
    );
  }

  if (!detail || !user) return <main className="p-4 text-sm text-[var(--text-3)]">Loading…</main>;
  const { case: c, student, events, prior_cases } = detail;

  const nowHHMM = nowOverrideFromUrl() || getCurrentTimeHHMM();
  const sortedSlots = slots
    ? [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time))
    : null;
  const nowNext = sortedSlots ? currentAndNextSession(sortedSlots, nowHHMM) : null;

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
      <Link href="/admin/cases" className="text-sm text-red-700 underline">← Active reports</Link>
      <h1 className="mt-2 text-xl font-bold">{c.student_name}</h1>
      <p className="text-sm text-[var(--text-2)]">{c.summary}{c.session_label ? ` — ${c.session_label}` : ''}</p>
      {c.status === 'resolved' && (
        <p className="mt-2 rounded bg-green-50 p-2 text-sm text-green-800">Resolved: {c.resolution_note}</p>
      )}

      {student && (
        <section className="mt-4 glass-card p-3 text-sm">
          <p><span className="font-medium">Dorm:</span> {student.dorm_building || 'Commuter'} {student.dorm_room || ''}</p>
          <p><span className="font-medium">Parent:</span> {student.parent_first_name} {student.parent_last_name} {student.parent_phone}</p>
          <p><span className="font-medium">Kid cell:</span> {student.cell_phone || '—'}</p>
          <p><span className="font-medium">Ensemble:</span> {student.ensemble} ({student.instrument})</p>
          {student.medical_notes && <p className="text-red-700"><span className="font-medium">Medical:</span> {student.medical_notes}</p>}
          {prior_cases.length > 0 && (
            <p className="mt-1 text-amber-700">⚠ {prior_cases.length} prior report{prior_cases.length > 1 ? 's' : ''}</p>
          )}
        </section>
      )}

      {student && nowNext && (
        <section className="mt-4 camp-card p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Where they should be</h2>
            {nowOverrideFromUrl() && (
              <span className="text-xs text-[var(--text-3)]">test clock {nowHHMM}</span>
            )}
          </div>
          <p className="mt-1">
            <span className="font-medium">Now:</span>{' '}
            {nowNext.current ? (
              <span className="text-green-800">
                {nowNext.current.name}
                {nowNext.current.location ? ` · ${nowNext.current.location}` : ''}{' '}
                <span className="text-[var(--text-3)]">
                  ({nowNext.current.start_time}–{nowNext.current.end_time})
                </span>
              </span>
            ) : (
              <span className="text-[var(--text-3)]">No class</span>
            )}
          </p>
          <p className="mt-0.5">
            <span className="font-medium">Next:</span> {formatNextLabel(nowNext.next)}
          </p>
          {sortedSlots && sortedSlots.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-[var(--text-2)]">Full day schedule</summary>
              <ol className="mt-1 flex flex-col gap-0.5 text-xs">
                {sortedSlots.map((s) => {
                  const isNow = nowNext.current?.session_id === s.session_id;
                  return (
                    <li
                      key={`${s.session_id}-${s.start_time}`}
                      className={isNow ? 'rounded bg-green-50 px-1 font-medium text-green-800' : 'px-1 text-[var(--text-2)]'}
                    >
                      <span className="text-[var(--text-3)]">{s.start_time}–{s.end_time}</span> {s.name}
                      {s.location ? ` · ${s.location}` : ''}
                    </li>
                  );
                })}
              </ol>
            </details>
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
            ✓ Resolve report
          </button>
          {showResolve && (
            <div className="rounded border p-3">
              <input
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Where/how was the kid found? (optional)"
                className="w-full rounded border p-2 text-sm"
              />
              {resolveError && (
                <p className="mt-1 text-sm text-red-700">{resolveError}</p>
              )}
              <button
                onClick={resolve}
                disabled={resolving}
                className="mt-2 rounded bg-green-700 px-4 py-1 text-white disabled:opacity-50"
              >
                {resolving ? 'Saving…' : 'Confirm resolve'}
              </button>
            </div>
          )}
        </section>
      )}

      <ShareLinkControls c={c} getAuthHeaders={getAuthHeaders} onChanged={refresh} />

      <section className="mt-6">
        <h2 className="font-semibold">Timeline</h2>
        <AddTimelineNote onSubmit={(body) => logEvent('note', body)} />
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {events.map((e) => {
            const isStaff = e.type === 'staff_update';
            return (
              <li
                key={e.id}
                className={
                  isStaff
                    ? 'rounded border-l-4 border-blue-400 bg-blue-50 p-2'
                    : 'rounded border-l-4 border-[var(--glass-border)] bg-[var(--surface)] p-2'
                }
              >
                <span className="text-xs text-[var(--text-3)]">
                  {new Date(e.created_at).toLocaleTimeString()} · {e.actor}
                  {isStaff && <span className="ml-1 font-medium text-blue-700">· staff link</span>}
                </span>
                <p>{e.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {prior_cases.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">
            Prior reports for {student?.preferred_name || student?.first_name || c.student_name}{' '}
            <span className="text-sm font-normal text-[var(--text-3)]">({prior_cases.length})</span>
          </h2>
          <div className="mt-2 flex flex-col gap-3">
            {prior_cases.map((p) => (
              <div key={p.id} className="glass-card p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <Link href={`/admin/cases/${p.id}`} className="font-medium text-red-700 underline">
                    {p.summary}
                    {p.session_label ? ` — ${p.session_label}` : ''}
                  </Link>
                  <span className="text-xs text-[var(--text-3)]">{new Date(p.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 text-xs">
                  <span className={p.status === 'resolved' ? 'text-green-700' : 'text-red-700'}>
                    {p.status === 'resolved' ? '✓ resolved' : '● active'}
                  </span>
                  {p.resolution_note ? ` — found: ${p.resolution_note}` : ''}
                </p>
                {p.events.length > 0 && (
                  <ol className="mt-2 flex flex-col gap-1 border-l-2 border-[var(--glass-border)] pl-3">
                    {p.events.map((e) => (
                      <li key={e.id} className="text-xs">
                        <span className="text-[var(--text-3)]">
                          {new Date(e.created_at).toLocaleString()} · {e.actor}
                          {e.type === 'staff_update' && <span className="ml-1 font-medium text-blue-700">· staff link</span>}
                        </span>
                        <p className="text-[var(--text)]">{e.body}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/** Two-way staff link controls (super_admin). Issues a 2h tokenized link to a
 * single staff recipient, shows the copyable /r/<token> URL with an expiry
 * countdown, and supports Revoke / Re-issue. */
function ShareLinkControls({
  c,
  getAuthHeaders,
  onChanged,
}: {
  c: Case;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState(c.share_recipient_label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so the countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiresAt = c.share_expires_at ? new Date(c.share_expires_at).getTime() : null;
  const active = !c.share_revoked && expiresAt !== null && now < expiresAt;

  function countdown(): string {
    if (!expiresAt) return '';
    const ms = expiresAt - now;
    if (ms <= 0) return 'expired';
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  }

  // Build an absolute URL for copy/paste convenience.
  const path = issuedUrl ?? (c.share_token ? `/r/${c.share_token}` : null);
  const absoluteUrl =
    path && typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/cases/${c.id}/share`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ recipient_label: label || null }),
      });
      if (!res.ok) throw new Error(`Failed to issue link (${res.status})`);
      const data = await res.json();
      setIssuedUrl(data.url as string);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/cases/${c.id}/share`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`Failed to revoke (${res.status})`);
      setIssuedUrl(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!absoluteUrl) return;
    setCopied(false);
    const write = navigator.clipboard?.writeText(absoluteUrl);
    if (!write) return;
    write.then(() => setCopied(true)).catch(() => setCopied(false));
  }

  return (
    <section className="mt-6 glass-card p-3 text-sm">
      <h2 className="font-semibold">Staff link</h2>
      <p className="mt-1 text-xs text-[var(--text-3)]">
        Send a single staff member a scoped, two-way link. It expires 2 hours after you send it,
        and dies automatically once the report is resolved.
      </p>

      <label className="mt-2 block">
        <span className="text-xs text-[var(--text-2)]">Who are you sending this to?</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Counselor Jane"
          className="mt-1 w-full rounded border p-2 text-sm"
        />
      </label>

      {active && absoluteUrl && (
        <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-xs">{absoluteUrl}</code>
            <button onClick={copy} className="rounded border bg-white px-2 py-1 text-xs">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1 text-xs text-blue-700">
            {c.share_recipient_label ? `To ${c.share_recipient_label} · ` : ''}
            {countdown()}
          </p>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          onClick={issue}
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : active ? 'Re-issue link' : 'Send staff link'}
        </button>
        {active && (
          <button onClick={revoke} disabled={busy} className="rounded border px-3 py-1.5">
            Revoke
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
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
    return <p className="rounded border border-dashed p-2 text-sm text-[var(--text-3)]">No dorm staff contacts yet — add them in Settings.</p>;
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
