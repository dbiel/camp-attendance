# Attendance History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A read-only admin "Attendance" sub-tab that shows which ensembles took attendance, when, and which scheduled rehearsals were missed — as a grid (default) and a chronological list, for past periods of a selectable day.

**Architecture:** A pure derivation helper (`lib/attendance-history.ts`, fully unit-tested) turns raw `ensemble_attendance` docs + live `periods` + live rehearsal `sessions` into a grid model + list. A thin `withAuth('lookup_admin')` API route feeds it Firestore data. A client page renders grid/list with a day picker.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Admin SDK, vitest, Tailwind (existing `glass`/`var(--…)` design tokens).

## Global Constraints

- Read-only. No schema change, no Firestore index, no cron, no change to the public `/e` flow.
- Camp tz `America/Chicago`; "past" via `getTodayDate()`/`getCurrentTimeHHMM()` (`lib/date.ts`); `?now=HH:MM` honored.
- Grid rows = `PICKER_ENSEMBLES` (Band 1–7, Orchestra 1–3) verbatim; list shows ALL submissions.
- Admin auth: `withAuth('lookup_admin', handler, { rateLimitKey })`; client uses `getAuthHeaders()` from `useAuth()`.
- `Session.period_id` is `String(period.number)` → `period_number = Number(session.period_id)`.
- Branch `feat/attendance-history` in isolated clone; never touch `main`.

---

### Task 1: Pure derivation helper `lib/attendance-history.ts` (TDD)

**Files:**
- Create: `lib/attendance-history.ts`
- Test: `tests/unit/lib/attendance-history.test.ts`

**Interfaces:**
- Produces: `buildAttendanceHistory(args: BuildArgs): AttendanceHistory`, and exported types `AttendanceSubmission`, `RehearsalSlot`, `AttendanceCell`, `AttendanceListItem`, `AttendanceHistory`, `BuildArgs`.

- [ ] **Step 1: Write failing tests** (`tests/unit/lib/attendance-history.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { buildAttendanceHistory, type BuildArgs } from '@/lib/attendance-history';
import type { Period } from '@/lib/types';

const periods: Period[] = [
  { id: '1', number: 1, name: 'Period 1', start_time: '08:00', end_time: '08:50' },
  { id: '2', number: 2, name: 'Period 2', start_time: '09:00', end_time: '09:50' },
  { id: '3', number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' },
];
const ensembles = ['Band 1', 'Band 2'] as const;
const base = (over: Partial<BuildArgs> = {}): BuildArgs => ({
  day: '2026-06-29', today: '2026-06-29', nowHHMM: '11:00',
  periods,
  rehearsalSessions: [
    { ensemble: 'Band 1', period_number: 1 },
    { ensemble: 'Band 1', period_number: 3 },
    { ensemble: 'Band 2', period_number: 2 },
  ],
  submissions: [
    { ensemble: 'Band 1', day_key: '2026-06-29', period_number: 1, period_name: 'Period 1',
      marks: { a: 'present', b: 'absent', c: 'absent' }, roster_size: 3, submitted_at: '2026-06-29T13:05:00.000Z' },
    { ensemble: 'Band 2', day_key: '2026-06-29', period_number: 2, period_name: 'Period 2',
      marks: { a: 'present' }, roster_size: 1, submitted_at: '2026-06-29T14:02:00.000Z' },
  ],
  allDayKeys: ['2026-06-29'],
  ensembles,
  ...over,
});

describe('buildAttendanceHistory', () => {
  it('emits only past periods ascending (today, now=11:00 → P1,P2,P3 all past)', () => {
    const r = buildAttendanceHistory(base());
    expect(r.periods.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('hides future periods today (now=09:30 → only P1 past)', () => {
    const r = buildAttendanceHistory(base({ nowHHMM: '09:30' }));
    expect(r.periods.map((p) => p.number)).toEqual([1]);
  });

  it('earlier day → all periods past regardless of now', () => {
    const r = buildAttendanceHistory(base({ day: '2026-06-28', nowHHMM: '00:00', allDayKeys: ['2026-06-28', '2026-06-29'] }));
    expect(r.periods.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('cell = taken with absent_count for a submitted ensemble+period', () => {
    const r = buildAttendanceHistory(base());
    expect(r.cells['Band 1'][1]).toEqual({ state: 'taken', submitted_at: '2026-06-29T13:05:00.000Z', absent_count: 2, roster_size: 3 });
  });

  it('cell = missed when a rehearsal is scheduled but no submission', () => {
    const r = buildAttendanceHistory(base());
    expect(r.cells['Band 1'][3]).toEqual({ state: 'missed' });
  });

  it('cell = none when no rehearsal scheduled that period', () => {
    const r = buildAttendanceHistory(base());
    expect(r.cells['Band 1'][2]).toEqual({ state: 'none' });
  });

  it('list is newest-first and flags in_grid / scheduled', () => {
    const r = buildAttendanceHistory(base());
    expect(r.list.map((x) => x.ensemble)).toEqual(['Band 2', 'Band 1']); // 14:02 before 13:05
    expect(r.list[1]).toMatchObject({ ensemble: 'Band 1', in_grid: true, scheduled: true, absent_count: 2 });
  });

  it('force-opened / non-standard submission → in_grid:false but still in list', () => {
    const r = buildAttendanceHistory(base({
      submissions: [
        { ensemble: 'Jazz 1', day_key: '2026-06-29', period_number: 12, period_name: '12:00–13:00',
          marks: { a: 'absent' }, roster_size: 1, submitted_at: '2026-06-29T17:00:00.000Z' },
      ],
    }));
    expect(r.list).toHaveLength(1);
    expect(r.list[0]).toMatchObject({ ensemble: 'Jazz 1', in_grid: false });
    expect(r.cells['Band 1']).toBeDefined(); // grid unaffected
  });

  it('availableDays = distinct day_keys ∪ today, newest first', () => {
    const r = buildAttendanceHistory(base({ allDayKeys: ['2026-06-27', '2026-06-28'] }));
    expect(r.availableDays).toEqual(['2026-06-29', '2026-06-28', '2026-06-27']);
  });

  it('empty inputs → empty grid, no throw', () => {
    const r = buildAttendanceHistory(base({ periods: [], submissions: [], rehearsalSessions: [], allDayKeys: [] }));
    expect(r.periods).toEqual([]);
    expect(r.list).toEqual([]);
    expect(r.availableDays).toEqual(['2026-06-29']);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run tests/unit/lib/attendance-history.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `lib/attendance-history.ts`:

```ts
import type { Period } from './types';

export interface AttendanceSubmission {
  ensemble: string;
  day_key: string;
  period_number: number;
  period_name: string;
  marks: Record<string, 'present' | 'absent'>;
  roster_size: number;
  submitted_at: string;
}

export interface RehearsalSlot {
  ensemble: string;
  period_number: number;
}

export type AttendanceCell =
  | { state: 'taken'; submitted_at: string; absent_count: number; roster_size: number }
  | { state: 'missed' }
  | { state: 'none' };

export interface AttendanceListItem {
  ensemble: string;
  period_number: number;
  period_name: string;
  submitted_at: string;
  absent_count: number;
  roster_size: number;
  scheduled: boolean;
  in_grid: boolean;
}

export interface AttendancePeriod {
  number: number;
  name: string;
  start_time: string;
  end_time: string;
}

export interface AttendanceHistory {
  day: string;
  periods: AttendancePeriod[];
  ensembles: string[];
  cells: Record<string, Record<number, AttendanceCell>>;
  list: AttendanceListItem[];
  availableDays: string[];
}

export interface BuildArgs {
  day: string;
  today: string;
  nowHHMM: string;
  periods: Period[];
  rehearsalSessions: RehearsalSlot[];
  submissions: AttendanceSubmission[];
  allDayKeys: string[];
  ensembles: readonly string[];
}

function absentCount(marks: Record<string, 'present' | 'absent'>): number {
  return Object.values(marks ?? {}).filter((m) => m === 'absent').length;
}

function isPast(p: Period, day: string, today: string, nowHHMM: string): boolean {
  if (day < today) return true;
  if (day > today) return false;
  return nowHHMM >= p.end_time;
}

export function buildAttendanceHistory(args: BuildArgs): AttendanceHistory {
  const { day, today, nowHHMM, periods, rehearsalSessions, submissions, allDayKeys, ensembles } = args;

  const daySubs = submissions.filter((s) => s.day_key === day);

  const pastPeriods: AttendancePeriod[] = periods
    .filter((p) => isPast(p, day, today, nowHHMM))
    .sort((a, b) => a.number - b.number)
    .map((p) => ({ number: p.number, name: p.name, start_time: p.start_time, end_time: p.end_time }));
  const pastNums = new Set(pastPeriods.map((p) => p.number));

  const scheduled = new Map<string, Set<number>>();
  for (const r of rehearsalSessions) {
    if (!scheduled.has(r.ensemble)) scheduled.set(r.ensemble, new Set());
    scheduled.get(r.ensemble)!.add(r.period_number);
  }

  const subByKey = new Map<string, AttendanceSubmission>();
  for (const s of daySubs) subByKey.set(`${s.ensemble}__${s.period_number}`, s);

  const cells: Record<string, Record<number, AttendanceCell>> = {};
  for (const ens of ensembles) {
    cells[ens] = {};
    for (const p of pastPeriods) {
      const sub = subByKey.get(`${ens}__${p.number}`);
      if (sub) {
        cells[ens][p.number] = {
          state: 'taken',
          submitted_at: sub.submitted_at,
          absent_count: absentCount(sub.marks),
          roster_size: sub.roster_size,
        };
      } else if (scheduled.get(ens)?.has(p.number)) {
        cells[ens][p.number] = { state: 'missed' };
      } else {
        cells[ens][p.number] = { state: 'none' };
      }
    }
  }

  const ensSet = new Set(ensembles);
  const list: AttendanceListItem[] = daySubs
    .slice()
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0))
    .map((s) => ({
      ensemble: s.ensemble,
      period_number: s.period_number,
      period_name: s.period_name,
      submitted_at: s.submitted_at,
      absent_count: absentCount(s.marks),
      roster_size: s.roster_size,
      scheduled: scheduled.get(s.ensemble)?.has(s.period_number) ?? false,
      in_grid: ensSet.has(s.ensemble) && pastNums.has(s.period_number),
    }));

  const availableDays = [...new Set([...allDayKeys, today])].sort().reverse();

  return { day, periods: pastPeriods, ensembles: [...ensembles], cells, list, availableDays };
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run tests/unit/lib/attendance-history.test.ts` → all PASS.
- [ ] **Step 5: Commit** — `git add lib/attendance-history.ts tests/unit/lib/attendance-history.test.ts && git commit -m "feat(attendance-history): pure derivation helper + tests"`

---

### Task 2: API route `app/api/admin/attendance-history/route.ts`

**Files:**
- Create: `app/api/admin/attendance-history/route.ts`

**Interfaces:**
- Consumes: `buildAttendanceHistory`, `AttendanceSubmission`, `RehearsalSlot` (Task 1); `getPeriods`/`getSessions` (`lib/firestore.ts`); `getTodayDate`/`getCurrentTimeHHMM` (`lib/date.ts`); `PICKER_ENSEMBLES` (`lib/ensemble-links.ts`); `withAuth` (`lib/with-auth.ts`); `adminDb` (`lib/firebase-admin`).
- Produces: `GET /api/admin/attendance-history?day=&now=` → `AttendanceHistory` JSON.

- [ ] **Step 1: Confirm `withAuth` handler signature** — `grep -n "export function withAuth" lib/with-auth.ts` and read how the wrapped handler receives the request (param name/type). Use that exact signature.

- [ ] **Step 2: Implement** the route (adjust the handler signature to match Step 1 — the request object exposes `.url`):

```ts
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getPeriods, getSessions } from '@/lib/firestore';
import { getTodayDate, getCurrentTimeHHMM } from '@/lib/date';
import { PICKER_ENSEMBLES } from '@/lib/ensemble-links';
import {
  buildAttendanceHistory,
  type AttendanceSubmission,
  type RehearsalSlot,
} from '@/lib/attendance-history';

export const dynamic = 'force-dynamic';

/**
 * Admin attendance history: which ensembles took attendance, when, and which
 * scheduled rehearsals were missed, for the past periods of a selectable day.
 * Read-only; lookup_admin and up. All derivation lives in lib/attendance-history.
 */
export const GET = withAuth(
  'lookup_admin',
  async (req: Request) => {
    const url = new URL(req.url);
    const today = getTodayDate();
    const day = url.searchParams.get('day') || today;
    const nowParam = url.searchParams.get('now');
    const nowHHMM = nowParam && /^\d{1,2}:\d{2}$/.test(nowParam) ? nowParam : getCurrentTimeHHMM();

    const [periods, sessions, snap] = await Promise.all([
      getPeriods(),
      getSessions(),
      adminDb.collection('ensemble_attendance').get(),
    ]);

    const rehearsalSessions: RehearsalSlot[] = sessions
      .filter((s) => s.type === 'rehearsal' && !!s.ensemble)
      .map((s) => ({ ensemble: s.ensemble as string, period_number: Number(s.period_id) }))
      .filter((r) => Number.isFinite(r.period_number));

    const submissions: AttendanceSubmission[] = snap.docs.map((d) => {
      const x = d.data() as {
        ensemble?: string; day_key?: string; period_number?: number; period_name?: string;
        marks?: Record<string, 'present' | 'absent'>; roster_size?: number; submitted_at?: string;
      };
      return {
        ensemble: x.ensemble ?? '',
        day_key: x.day_key ?? '',
        period_number: x.period_number ?? 0,
        period_name: x.period_name ?? (x.period_number ? `Period ${x.period_number}` : '—'),
        marks: x.marks ?? {},
        roster_size: x.roster_size ?? 0,
        submitted_at: x.submitted_at ?? '',
      };
    });
    const allDayKeys = [...new Set(submissions.map((s) => s.day_key).filter(Boolean))];

    const data = buildAttendanceHistory({
      day, today, nowHHMM, periods, rehearsalSessions, submissions, allDayKeys,
      ensembles: PICKER_ENSEMBLES,
    });
    return NextResponse.json(data);
  },
  { rateLimitKey: 'admin-attendance-history' }
);
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no new errors.
- [ ] **Step 4: Commit** — `git add app/api/admin/attendance-history/route.ts && git commit -m "feat(attendance-history): admin API route"`

---

### Task 3: UI — view component + page

**Files:**
- Create: `app/admin/data/attendance/AttendanceHistoryView.tsx`
- Create: `app/admin/data/attendance/page.tsx`

**Interfaces:**
- Consumes: `AttendanceHistory` JSON from `/api/admin/attendance-history`; `useAuth().getAuthHeaders` + `.user`/`.loading`; `formatClock` (`lib/date.ts`) for times.
- Produces: default-exported `AttendanceDataPage` (page) rendering `<AttendanceHistoryView/>`.

- [ ] **Step 1: Implement `AttendanceHistoryView.tsx`** — client component: fetch on mount + when `day` changes; `[ Grid | List ]` pill toggle (grid default); day `<select>` from `availableDays`; grid table (ensembles × past periods) with green/grey/dash cells + inline absent badge + a tappable detail line; list grouped by period newest-first; footnote explaining grey vs green and force-opened. Use existing `glass`/`var(--…)` classes and the table styling from `EnsembleAttendanceGrid.tsx`. Cell rendering:
  - `taken` → green bg, shows `N abs` (or `✓` when `absent_count===0`); click toggles a small detail (`taken <formatClock(submitted_at)> · N/roster absent`).
  - `missed` → grey bg, em dash or "—".
  - `none` → faint dash, non-interactive.
  Empty states: no past periods yet → "No past periods yet for this day."; no submissions in list → "No attendance taken yet."

- [ ] **Step 2: Implement `page.tsx`** (thin wrapper mirroring `app/admin/cases/history/page.tsx`):

```tsx
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
```

- [ ] **Step 3: Typecheck + build** — `npx tsc --noEmit` and `npm run build` → success.
- [ ] **Step 4: Commit** — `git add app/admin/data/attendance && git commit -m "feat(attendance-history): admin grid+list view and page"`

---

### Task 4: Nav wiring (`app/admin/layout.tsx`)

**Files:**
- Modify: `app/admin/layout.tsx` (`SUB_TABS` + `resolveTabs`)

- [ ] **Step 1: Add the sub-tab** — append to `SUB_TABS` (after `sessions`):
```ts
  { key: 'attendance', label: 'Attendance', href: '/admin/data/attendance' },
```
- [ ] **Step 2: Add the route mapping** — in `resolveTabs`, BEFORE the generic `if (pathname.startsWith('/admin/data/'))` fallback, add:
```ts
  if (pathname.startsWith('/admin/data/attendance')) return { primary: 'data', sub: 'attendance' };
```
- [ ] **Step 3: Build** — `npm run build` → success; manually confirm the tab appears in the rendered nav.
- [ ] **Step 4: Commit** — `git add app/admin/layout.tsx && git commit -m "feat(attendance-history): add Attendance Data sub-tab"`

---

### Task 5: Full verification + ship

- [ ] **Step 1: Full unit suite** — `npx vitest run tests/unit` → all pass (587 baseline + new).
- [ ] **Step 2: Typecheck + production build** — `npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 3: Self code-review** — invoke `superpowers:requesting-code-review` (or `/code-review`) over the diff; address Critical/Important.
- [ ] **Step 4: Push branch + open PR** — `git push -u origin feat/attendance-history` (NEVER main) then `gh pr create` into `main` (use the `bieldentalcabinets`/`dbiel` auth that this repo requires).
- [ ] **Step 5: Deploy hosting** — from the clone: `FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only hosting` (Node 24, webframeworks) → `release complete`.
- [ ] **Step 6: Prod smoke** — `GET /api/admin/attendance-history` with no auth → 401; load `/admin/data/attendance` (David, logged in) → grid renders, toggle + day picker + `?now=` work.
- [ ] **Step 7: Update STATUS.md** top block with a Session entry (no main push).
