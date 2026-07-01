'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import type { TextDoc } from '@/lib/types';
import { CaseCard } from './CaseCard';
import { CaseDetailView } from './CaseDetailView';
import { NewReport } from './NewReport';
import { SelectionBar } from './SelectionBar';
import { ReportHistory } from './ReportHistory';
import { initSeenIfEmpty, isUnseen, readSeen, type SeenMap } from '@/lib/seen';
import { partitionActiveByHour, currentHourKey } from '@/lib/active-board';
import { MarkAbsent } from './MarkAbsent';
import { MarkedAbsentList } from './MarkedAbsentList';

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
  const nowOverride = searchParams.get('now') ?? undefined; // ?now=HH:MM for testing periods
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedText, setSeedText] = useState<string | undefined>(undefined);
  const [seedReady, setSeedReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Desktop split view: the report shown in the right-hand panel (null = none,
  // left list spans full width). Distinct from `selected` (the combined-staff-
  // link checkboxes). Phones ignore this and navigate to the detail page.
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  // Starts {} so the first (SSR-matching) render shows no badges; an effect loads
  // the real map after mount → no hydration mismatch.
  const [seen, setSeen] = useState<SeenMap>({});
  // Alert when a poll surfaces NEW reports or fresh activity on existing ones
  // (a staff-link reply, a tardy arrival → maybe closeable). Track each report's
  // last-activity stamp so we can tell "new" from "updated".
  const prevActivity = useRef<Map<string, string> | null>(null);
  // Case ids whose activity was just bumped by David himself (tapped "Text
  // parent"/"Text dorm staff" in the open panel) — the next poll should absorb
  // that bump silently instead of alerting on it, since he already knows.
  const selfBumped = useRef<Set<string>>(new Set());
  const [newArrivals, setNewArrivals] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  // Bumped whenever an office-marked absence is added (form) so the always-on
  // MarkedAbsentList on the board reloads.
  const [absRefresh, setAbsRefresh] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cases?status=active', { headers });
      if (res.ok) {
        const list = (await res.json()).cases as Case[];
        // Compare against the previous poll (skip the very first load): a report
        // not seen before = "new"; one whose last-activity stamp changed = "updated".
        const activityOf = (c: Case) => c.last_activity_at || c.created_at;
        if (prevActivity.current) {
          let added = 0;
          let updated = 0;
          for (const c of list) {
            const prev = prevActivity.current.get(c.id);
            if (prev === undefined) added++;
            else if (prev !== activityOf(c)) {
              if (selfBumped.current.has(c.id)) selfBumped.current.delete(c.id);
              else updated++;
            }
          }
          if (added > 0) setNewArrivals((n) => n + added);
          if (updated > 0) setUpdatedCount((n) => n + updated);
        }
        prevActivity.current = new Map(list.map((c) => [c.id, activityOf(c)]));
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
    // Poll every 15s, but skip ticks while the tab is hidden (saves battery /
    // reads on a phone in a pocket); refresh immediately on regaining focus.
    const interval = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15_000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refresh]);

  // Load the "seen" map after each fetch so newly-arrived activity badges, and
  // a report opened-then-returned no longer does. Seeds on first run so existing
  // reports don't all badge at once.
  useEffect(() => {
    if (loading) return;
    initSeenIfEmpty(cases);
    setSeen(readSeen());
  }, [loading, cases]);

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

  // Newest-first. The TOP board shows ONLY the current clock hour. Once an
  // incident's hour passes it drops off the top and lives in the history section
  // below (still active, flagged red there — never hidden, just out of the live
  // board). ?now=HH:MM overrides the hour for testing.
  const nowHourKey = currentHourKey(nowOverride ?? null, new Date().toISOString());
  const { thisHour, carriedOver } = partitionActiveByHour(cases, nowHourKey);
  const selectedCaseIds = thisHour.filter((c) => selected.has(c.id)).map((c) => c.id);
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
    <main className={`mx-auto p-4 ${openId ? 'max-w-2xl lg:max-w-6xl' : 'max-w-2xl'}`}>
      {newArrivals + updatedCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setNewArrivals(0);
            setUpdatedCount(0);
          }}
          className="mb-3 flex w-full animate-pulse items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white shadow"
        >
          🔔{' '}
          {[
            newArrivals > 0 ? `${newArrivals} new` : null,
            updatedCount > 0 ? `${updatedCount} updated` : null,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          — tap to dismiss
        </button>
      )}
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Active Reports</h1>
        <div className="flex gap-2">
          {!newOpen && (
            <button type="button" onClick={() => setShowNew(true)} className="camp-btn-primary px-3 py-1.5 text-sm">
              + New report
            </button>
          )}
          <MarkAbsent getAuthHeaders={getAuthHeaders} onChanged={() => setAbsRefresh((n) => n + 1)} />
        </div>
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
          onRefresh={refresh}
          onCancel={() => {
            setShowNew(false);
            if (fromText) router.replace('/admin/cases');
          }}
          seedText={seedText}
          sourceTextId={fromText ?? undefined}
        />
      )}

      {/* Desktop split view: when a report is open it shows in the right column;
          the active-reports list stays on the left. A divider line + a "→ name"
          header in the panel mark which child is on the right. Phones never set
          `openId` (CaseCard navigates instead) so they keep the full-page flow. */}
      <div className={`mt-4 ${openId ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-0' : ''}`}>
        {/* LEFT COLUMN: active reports + selection bar + report history. The
            whole board (including history) stays on the left when a report is
            open on the right, so the panel never pushes history full-width. */}
        <div className={openId ? 'min-w-0 lg:pr-5' : ''}>
          <section className="flex flex-col gap-2">
            {loading && <p className="text-sm text-[var(--text-3)]">Loading…</p>}
            {!loading && thisHour.length === 0 && carriedOver.length === 0 && (
              <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
                No active reports. 🎺
              </p>
            )}
            {!loading && thisHour.length === 0 && carriedOver.length > 0 && (
              <p className="rounded border border-[var(--glass-border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-2)]">
                No active reports this hour.
              </p>
            )}

            {thisHour.map((c) => (
              <CaseCard
                key={c.id}
                c={c}
                selected={selected.has(c.id)}
                onToggleSelect={toggleSelect}
                onOpen={setOpenId}
                isOpen={openId === c.id}
                nowOverride={nowOverride}
                updateFlag={
                  isUnseen(c, seen, { treatUnknownAsNew: true })
                    ? seen[c.id] !== undefined ? 'updated' : 'new'
                    : null
                }
              />
            ))}

            {/* Hour-passed incidents leave the live board — a single pointer to the
                history section below keeps a still-missing kid one tap away. */}
            {carriedOver.length > 0 && (
              <a
                href="#report-history"
                className="mt-1 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                <span>⏱ {carriedOver.length} still active from an earlier hour</span>
                <span className="font-semibold">in history below ↓</span>
              </a>
            )}
          </section>

          <SelectionBar
            caseIds={selectedCaseIds}
            getAuthHeaders={getAuthHeaders}
            onClear={() => setSelected(new Set())}
            onResolved={() => {
              setSelected(new Set());
              refresh();
            }}
          />

          {/* Always-on list of office-marked (excused) absences — between the
              active board and the history so the office sees them at a glance
              without opening the Mark-absent form. */}
          <MarkedAbsentList
            getAuthHeaders={getAuthHeaders}
            refreshKey={absRefresh}
            onChanged={() => setAbsRefresh((n) => n + 1)}
          />

          {/* Report history (day → hour). Hour-passed still-active incidents land
              here (flagged red, "N active"). */}
          <div id="report-history" className="mt-8 border-t pt-4">
            <ReportHistory defaultStatus="active" />
          </div>
        </div>

        {openId && (
          <aside className="mt-4 border-t pt-4 lg:mt-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:self-start lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 lg:sticky lg:top-20">
            <CaseDetailView
              key={openId}
              caseId={openId}
              variant="panel"
              onClose={() => setOpenId(null)}
              onResolved={() => {
                setOpenId(null);
                refresh();
              }}
              onSelectCase={(id) => setOpenId(id)}
              onSelfTexted={(id) => selfBumped.current.add(id)}
            />
          </aside>
        )}
      </div>
    </main>
  );
}
