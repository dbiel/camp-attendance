# Hourly-Rolling Ensemble Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each `/e/<token>` ensemble attendance link period-aware — the attendance-taker sees only the current hour's rehearsal, takes attendance for it, and the sheet resets when the next period begins, while admin keeps a per-period record.

**Architecture:** Add a pure resolver that, given an ensemble's rehearsal slots and the camp-tz clock, returns the current rehearsal period (or "no rehearsal now"). Re-key the existing per-day attendance submission doc to per-day-**and-period**. The public GET returns the live session context; the page shows it with a rollover countdown; submit re-resolves the period server-side and rejects when there's no rehearsal.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Firestore (firebase-admin) · Vitest · Tailwind (existing `var(--*)` design tokens).

## Global Constraints

- **Node 24 mandatory.** Run tests with the repo's configured runner (`npm test`).
- **Camp timezone is `America/Chicago`** — always derive "today"/clock via `lib/date.ts` helpers (`getTodayDate`, `getCurrentTimeHHMM`), never `new Date()` arithmetic.
- **Anonymous trust model unchanged:** the submitter is anonymous; the server re-derives roster + period from the token. The client NEVER chooses the period. Refs are opaque indices into the id-sorted roster; only `present`/`absent` for in-range refs are accepted.
- **No external contact of any kind** (no texts/emails/push). Absences surface only as in-app incident reports. The CI egress guard (`tests/unit/no-external-egress.test.ts`) must stay green.
- **Same links, no re-issuing.** Do not change `ensemble_links`, token format, link issuing/revoking, or the projection (`toEnsembleRosterProjection`).
- **`?now=HH:MM`** query override must keep working for testing, on both the GET and submit routes (validated against `/^\d{1,2}:\d{2}$/`).
- Uniform `404` (`{ error: 'This link is no longer valid.' }`) for unknown/revoked tokens — no enumeration.

---

## File structure

- `lib/schedule.ts` — **modify**: add pure `resolveEnsembleNow(slots, nowHHMM)`.
- `lib/ensemble-attendance.ts` — **modify**: period-key the submission; add `getCurrentEnsembleSession` + internal `resolveCurrentPeriod`; thread period into `getEnsembleSubmission`/`submitEnsembleAttendance`; stamp reports with the period.
- `app/api/e/[token]/route.ts` — **modify**: return session context + period-scoped submission.
- `app/api/e/[token]/submit/route.ts` — **modify**: pass `?now=` through; surface `no_rehearsal`.
- `app/e/[token]/page.tsx` — **modify**: session header + rollover countdown + auto-refresh + no-rehearsal card.
- `app/api/admin/ensemble-attendance/route.ts` — **create**: admin period×day grid data (auth-gated).
- `app/admin/data/sessions/EnsembleAttendanceGrid.tsx` (or nearest existing ensemble admin surface) — **create**: read-only grid.
- Tests: `tests/unit/schedule-ensemble-now.test.ts`, `tests/unit/ensemble-attendance-period.test.ts`.

---

### Task 1: Pure resolver `resolveEnsembleNow`

**Files:**
- Modify: `lib/schedule.ts` (append a new export; reuse existing `ScheduleSlot` + `currentAndNextSession`)
- Test: `tests/unit/schedule-ensemble-now.test.ts`

**Interfaces:**
- Consumes: existing `ScheduleSlot` (`{ session_id, name, type, location, period_number, start_time, end_time }`) and `currentAndNextSession(slots, nowHHMM)` from `lib/schedule.ts`.
- Produces: `resolveEnsembleNow(slots: ScheduleSlot[], nowHHMM: string): EnsembleNow` where
  `EnsembleNow = { status: 'rehearsal'; current: ScheduleSlot; next: ScheduleSlot | null } | { status: 'no_rehearsal'; current: null; next: ScheduleSlot | null }`.
  Gates to `type === 'rehearsal'` slots only; `next` is the next rehearsal after now.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/schedule-ensemble-now.test.ts
import { describe, it, expect } from 'vitest';
import { resolveEnsembleNow } from '@/lib/schedule';
import type { ScheduleSlot } from '@/lib/schedule';

const slot = (over: Partial<ScheduleSlot>): ScheduleSlot => ({
  session_id: 's', name: 'Rehearsal', type: 'rehearsal', location: 'Hemmle',
  period_number: 0, start_time: '00:00', end_time: '00:00', ...over,
});

// Orchestra-1-like back-to-back morning block + afternoon block, plus a sectional
// (non-rehearsal) that must be ignored by the gate.
const slots: ScheduleSlot[] = [
  slot({ session_id: 'r2', period_number: 2, start_time: '09:00', end_time: '09:50' }),
  slot({ session_id: 'r3', period_number: 3, start_time: '10:00', end_time: '10:50' }),
  slot({ session_id: 'r9', period_number: 9, start_time: '16:00', end_time: '16:50' }),
  slot({ session_id: 'sec', type: 'sectional', period_number: 5, start_time: '12:00', end_time: '12:50' }),
];

describe('resolveEnsembleNow', () => {
  it('inside a rehearsal window → status rehearsal with that slot', () => {
    const r = resolveEnsembleNow(slots, '10:15');
    expect(r.status).toBe('rehearsal');
    expect(r.current?.session_id).toBe('r3');
    expect(r.current?.period_number).toBe(3);
  });

  it('back-to-back: 09:30 picks period 2, next is period 3', () => {
    const r = resolveEnsembleNow(slots, '09:30');
    expect(r.current?.period_number).toBe(2);
    expect(r.next?.period_number).toBe(3);
  });

  it('end of window is exclusive → 09:50 is between blocks (no rehearsal)', () => {
    const r = resolveEnsembleNow(slots, '09:50');
    expect(r.status).toBe('no_rehearsal');
    expect(r.next?.period_number).toBe(3);
  });

  it('passing time at noon (only a sectional) → no rehearsal, next is afternoon block', () => {
    const r = resolveEnsembleNow(slots, '12:10');
    expect(r.status).toBe('no_rehearsal');
    expect(r.next?.period_number).toBe(9);
  });

  it('after the last rehearsal → no rehearsal, next null', () => {
    const r = resolveEnsembleNow(slots, '18:00');
    expect(r.status).toBe('no_rehearsal');
    expect(r.next).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schedule-ensemble-now.test.ts`
Expected: FAIL — `resolveEnsembleNow is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/schedule.ts`:

```ts
export type EnsembleNow =
  | { status: 'rehearsal'; current: ScheduleSlot; next: ScheduleSlot | null }
  | { status: 'no_rehearsal'; current: null; next: ScheduleSlot | null };

/**
 * Resolve an ensemble's CURRENT rehearsal at `nowHHMM` (camp-local). Gates to
 * `type === 'rehearsal'` slots so meals/sectionals/electives never offer
 * attendance. Reuses the strict-window `currentAndNextSession`; `next` is the
 * ensemble's next rehearsal today (drives the "Next: …" line when idle).
 */
export function resolveEnsembleNow(slots: ScheduleSlot[], nowHHMM: string): EnsembleNow {
  const rehearsals = slots.filter((s) => s.type === 'rehearsal');
  const { current, next } = currentAndNextSession(rehearsals, nowHHMM);
  return current
    ? { status: 'rehearsal', current, next }
    : { status: 'no_rehearsal', current: null, next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/schedule-ensemble-now.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/schedule.ts tests/unit/schedule-ensemble-now.test.ts
git commit -m "feat(schedule): resolveEnsembleNow — current rehearsal period for an ensemble"
```

---

### Task 2: Period-key the attendance submission + report stamping

**Files:**
- Modify: `lib/ensemble-attendance.ts`
- Test: `tests/unit/ensemble-attendance-period.test.ts`

**Interfaces:**
- Consumes: `resolveEnsembleNow` (Task 1); `getSessions`, `getPeriods` from `@/lib/firestore`; `getCurrentTimeHHMM` from `@/lib/date`; `validateEnsembleToken`, `getEnsembleRoster` (existing).
- Produces:
  - `resolveCurrentPeriod(ensemble: string, nowHHMM: string): Promise<CurrentPeriod | null>` where
    `CurrentPeriod = { period_number: number; period_name: string; period_id: string; session_id: string; start_time: string; end_time: string; location: string | null; next: { period_name: string; start_time: string } | null }`. Returns `null` when no rehearsal now (carrying the next-rehearsal hint via a separate return — see note).
  - `getCurrentEnsembleSession(token: string, nowHHMM?: string): Promise<EnsembleSessionContext | null>` (null = invalid/revoked token).
  - `getEnsembleSubmission(token, day, period: number)` — now period-scoped.
  - `submitEnsembleAttendance({ token, marksByRef, expectedRosterSize?, nowHHMM? })` — resolves the period server-side; new `SubmitResult` member `{ ok: false; reason: 'no_rehearsal' }`.

**Note on the null/next split:** `resolveCurrentPeriod` returns the full `CurrentPeriod` when in a rehearsal, else `null`. `getCurrentEnsembleSession` needs the "next" hint even when idle, so it calls `resolveEnsembleNow` directly (it already loads slots) rather than going through `resolveCurrentPeriod`. `submitEnsembleAttendance` only needs the in-rehearsal case, so it uses `resolveCurrentPeriod`.

- [ ] **Step 1: Write the failing test** (mock Firestore-touching deps; assert keying + gating logic)

```ts
// tests/unit/ensemble-attendance-period.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the I/O collaborators so we test the period/keying logic only.
const sessions = [
  { id: 'r3', ensemble: 'Band 1', type: 'rehearsal', period_id: '3', location: 'Hemmle', name: 'Band 1 Rehearsal' },
  { id: 'r4', ensemble: 'Band 1', type: 'rehearsal', period_id: '4', location: 'Hemmle', name: 'Band 1 Rehearsal' },
];
const periods = [
  { id: '3', number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' },
  { id: '4', number: 4, name: 'Period 4A', start_time: '11:00', end_time: '11:50' },
];
vi.mock('@/lib/firestore', () => ({
  getSessions: vi.fn(async () => sessions),
  getPeriods: vi.fn(async () => periods),
}));
vi.mock('@/lib/ensemble-links', () => ({
  validateEnsembleToken: vi.fn(async (t: string) => (t === 'good' ? { ensemble: 'Band 1', label: 'Ms. G' } : null)),
  getEnsembleRoster: vi.fn(async () => [{ id: 'a', first_name: 'Al', last_name: 'X', instrument: 'Flute' }]),
}));

import { getCurrentEnsembleSession, resolveCurrentPeriod } from '@/lib/ensemble-attendance';

describe('period resolution', () => {
  it('resolveCurrentPeriod inside Period 3 → keys to period 3 + session r3', async () => {
    const cur = await resolveCurrentPeriod('Band 1', '10:20');
    expect(cur?.period_number).toBe(3);
    expect(cur?.session_id).toBe('r3');
    expect(cur?.period_name).toBe('Period 3');
  });

  it('resolveCurrentPeriod during lunch (12:30) → null', async () => {
    expect(await resolveCurrentPeriod('Band 1', '12:30')).toBeNull();
  });

  it('getCurrentEnsembleSession idle → status no_rehearsal with next hint', async () => {
    const ctx = await getCurrentEnsembleSession('good', '09:30');
    expect(ctx?.status).toBe('no_rehearsal');
    expect(ctx?.next?.period_name).toBe('Period 3');
  });

  it('getCurrentEnsembleSession in rehearsal → status rehearsal + window', async () => {
    const ctx = await getCurrentEnsembleSession('good', '11:10');
    expect(ctx?.status).toBe('rehearsal');
    expect(ctx?.period_number).toBe(4);
    expect(ctx?.end_time).toBe('11:50');
  });

  it('invalid token → null', async () => {
    expect(await getCurrentEnsembleSession('bad', '11:10')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ensemble-attendance-period.test.ts`
Expected: FAIL — `resolveCurrentPeriod` / `getCurrentEnsembleSession` not exported.

- [ ] **Step 3: Implement in `lib/ensemble-attendance.ts`**

Add imports at the top:

```ts
import { getSessions, getPeriods } from './firestore';
import { getCurrentTimeHHMM } from './date';
import { resolveEnsembleNow, type ScheduleSlot } from './schedule';
```

Add types + resolvers (place above `getEnsembleSubmission`):

```ts
export interface CurrentPeriod {
  period_number: number;
  period_name: string;
  period_id: string;
  session_id: string;
  start_time: string;
  end_time: string;
  location: string | null;
}

export interface EnsembleSessionContext {
  ensemble: string;
  label: string | null;
  now: string; // HH:MM used
  status: 'rehearsal' | 'no_rehearsal';
  period_number: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  next: { period_name: string; start_time: string } | null;
}

const HHMM_RE = /^\d{1,2}:\d{2}$/;

/** Build the ensemble's schedule slots (rehearsals included) + a period-name map. */
async function loadEnsembleSlots(
  ensemble: string
): Promise<{ slots: ScheduleSlot[]; periodName: Map<number, string> }> {
  const [sessions, periods] = await Promise.all([getSessions(), getPeriods()]);
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const periodName = new Map<number, string>(periods.map((p) => [p.number, p.name]));
  const slots: ScheduleSlot[] = [];
  for (const s of sessions) {
    if (s.ensemble !== ensemble) continue;
    const p = periodById.get(s.period_id);
    slots.push({
      session_id: s.id,
      name: s.name,
      type: s.type,
      location: s.location ?? null,
      period_number: p?.number ?? 0,
      start_time: p?.start_time ?? '',
      end_time: p?.end_time ?? '',
    });
  }
  return { slots, periodName };
}

/** The ensemble's CURRENT rehearsal period (server truth for keying), or null. */
export async function resolveCurrentPeriod(
  ensemble: string,
  nowHHMM: string = getCurrentTimeHHMM()
): Promise<CurrentPeriod | null> {
  const { slots, periodName } = await loadEnsembleSlots(ensemble);
  const r = resolveEnsembleNow(slots, nowHHMM);
  if (r.status !== 'rehearsal') return null;
  const c = r.current;
  return {
    period_number: c.period_number,
    period_name: periodName.get(c.period_number) ?? `Period ${c.period_number}`,
    period_id: String(c.period_number),
    session_id: c.session_id,
    start_time: c.start_time,
    end_time: c.end_time,
    location: c.location,
  };
}

/** Full session context for the public page (handles invalid token + idle). */
export async function getCurrentEnsembleSession(
  token: string,
  nowHHMM?: string
): Promise<EnsembleSessionContext | null> {
  const v = await validateEnsembleToken(token);
  if (!v) return null;
  const now = nowHHMM && HHMM_RE.test(nowHHMM) ? nowHHMM : getCurrentTimeHHMM();
  const { slots, periodName } = await loadEnsembleSlots(v.ensemble);
  const r = resolveEnsembleNow(slots, now);
  const base = { ensemble: v.ensemble, label: v.label, now };
  if (r.status === 'rehearsal') {
    const c = r.current;
    return {
      ...base,
      status: 'rehearsal',
      period_number: c.period_number,
      period_name: periodName.get(c.period_number) ?? `Period ${c.period_number}`,
      start_time: c.start_time,
      end_time: c.end_time,
      location: c.location,
      next: null,
    };
  }
  return {
    ...base,
    status: 'no_rehearsal',
    period_number: null,
    period_name: null,
    start_time: null,
    end_time: null,
    location: null,
    next: r.next
      ? { period_name: periodName.get(r.next.period_number) ?? `Period ${r.next.period_number}`, start_time: r.next.start_time }
      : null,
  };
}
```

Change `docId` to include the period, and add `period_number`/`period_name` to `SubmissionDoc`:

```ts
function docId(token: string, day: string, period: number): string {
  return `${token}__${day}__P${period}`;
}
```

In `interface SubmissionDoc` add:

```ts
  period_number: number;
  period_name: string;
```

Update `getEnsembleSubmission` to be period-scoped:

```ts
export async function getEnsembleSubmission(
  token: string,
  day: string,
  period: number
): Promise<SubmissionDoc | null> {
  const doc = await adminDb.collection(SUBMISSIONS).doc(docId(token, day, period)).get();
  return doc.exists ? (doc.data() as SubmissionDoc) : null;
}
```

Update `SubmitResult` and `submitEnsembleAttendance`:

```ts
export type SubmitResult =
  | { ok: false; reason: 'not_found' | 'roster_changed' | 'no_rehearsal' }
  | { ok: true; absent_count: number; arrived_count: number; newly_absent: number };
```

In `submitEnsembleAttendance`, change the signature to accept `nowHHMM?` and resolve the period right after `validateEnsembleToken`:

```ts
export async function submitEnsembleAttendance(args: {
  token: string;
  marksByRef: Record<number, Mark>;
  expectedRosterSize?: number;
  day?: string;
  now?: Date;
  nowHHMM?: string;
}): Promise<SubmitResult> {
  const now = args.now ?? new Date();
  const day = args.day ?? getTodayDate();
  const v = await validateEnsembleToken(args.token);
  if (!v) return { ok: false, reason: 'not_found' };

  const cur = await resolveCurrentPeriod(v.ensemble, args.nowHHMM ?? getCurrentTimeHHMM(now));
  if (!cur) return { ok: false, reason: 'no_rehearsal' };
  // ... existing roster + roster_changed check ...
```

> Note: `getCurrentTimeHHMM` accepts a `Date`; passing `now` keeps the override (`nowHHMM`) and the wall clock consistent.

Then use `cur.period_number` in the doc ref:

```ts
  const subRef = adminDb.collection(SUBMISSIONS).doc(docId(args.token, day, cur.period_number));
```

Stamp the filed case with the period (inside the transaction, in the `buildCaseDoc({...})` call) by adding:

```ts
              session_label: `${v.ensemble} · ${cur.period_name}`,
              session_id: cur.session_id,
              period_id: cur.period_id,
              period_number: cur.period_number,
```

(replace the existing `session_label: v.ensemble,` line; add the three new fields next to it).

And add the period fields to the written `payload`:

```ts
    const payload: SubmissionDoc = {
      token: args.token,
      ensemble: v.ensemble,
      day_key: day,
      period_number: cur.period_number,
      period_name: cur.period_name,
      marks: mergedMarks,
      case_ids: caseIds,
      submitted_at: existing?.submitted_at ?? nowIso,
      updated_at: nowIso,
      roster_size: roster.length,
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ensemble-attendance-period.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ensemble-attendance.ts tests/unit/ensemble-attendance-period.test.ts
git commit -m "feat(attendance): period-key ensemble submissions + stamp reports with the period"
```

---

### Task 3: Public GET route returns session context

**Files:**
- Modify: `app/api/e/[token]/route.ts`

**Interfaces:**
- Consumes: `getCurrentEnsembleSession`, `getRosterForToken`, `getEnsembleSubmission` (period-scoped) from `lib/ensemble-attendance`; `toEnsembleRosterProjection`; `getTodayDate`.
- Produces: JSON `{ ensemble, label, session, roster, roster_size, submission }` where `session` is the `EnsembleSessionContext` minus `ensemble`/`label`, `roster` is `[]` when idle, and `submission` is the period-scoped marks (or `null`).

- [ ] **Step 1: Replace the route body** (no separate unit test — covered by Task 6 manual smoke + existing route tests; this is wiring)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentEnsembleSession, getRosterForToken, getEnsembleSubmission } from '@/lib/ensemble-attendance';
import { toEnsembleRosterProjection } from '@/lib/projections';
import { getTodayDate } from '@/lib/date';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;
const HHMM_RE = /^\d{1,2}:\d{2}$/;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const nowParam = new URL(request.url).searchParams.get('now');
  const nowHHMM = nowParam && HHMM_RE.test(nowParam) ? nowParam : undefined;

  const ctx = await getCurrentEnsembleSession(params.token, nowHHMM);
  if (!ctx) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });

  const session = {
    status: ctx.status,
    period_number: ctx.period_number,
    period_name: ctx.period_name,
    start_time: ctx.start_time,
    end_time: ctx.end_time,
    location: ctx.location,
    next: ctx.next,
  };

  // Idle: no roster, no submission — the page shows the "no rehearsal" card.
  if (ctx.status !== 'rehearsal' || ctx.period_number === null) {
    return NextResponse.json({ ensemble: ctx.ensemble, label: ctx.label, session, roster: [], roster_size: 0, submission: null });
  }

  const rosterData = await getRosterForToken(params.token);
  if (!rosterData) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  const roster = toEnsembleRosterProjection(rosterData.roster);

  const submission = await getEnsembleSubmission(params.token, getTodayDate(), ctx.period_number);
  let marks_by_ref: Record<number, 'present' | 'absent'> | null = null;
  if (submission) {
    marks_by_ref = {};
    rosterData.roster.forEach((s, i) => {
      const m = submission.marks[s.id];
      if (m) marks_by_ref![i] = m;
    });
  }

  return NextResponse.json({
    ensemble: ctx.ensemble,
    label: ctx.label,
    session,
    roster,
    roster_size: rosterData.roster.length,
    submission: submission
      ? { marks_by_ref, locked: true, submitted_at: submission.submitted_at, updated_at: submission.updated_at }
      : null,
  });
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/api/e/[token]/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/e/[token]/route.ts
git commit -m "feat(api): /e GET returns live session context + period-scoped marks"
```

---

### Task 4: Submit route honors `?now=` and surfaces `no_rehearsal`

**Files:**
- Modify: `app/api/e/[token]/submit/route.ts`

**Interfaces:**
- Consumes: `submitEnsembleAttendance({ token, marksByRef, expectedRosterSize?, nowHHMM? })`.
- Produces: `409` for `roster_changed`; **`409` `{ error: 'No rehearsal is in session right now — please reload.' }` for `no_rehearsal`**; `404` uniform for `not_found`.

- [ ] **Step 1: Add the `?now=` passthrough and `no_rehearsal` branch**

In `app/api/e/[token]/submit/route.ts`, after computing `expectedRosterSize`, read the override:

```ts
  const nowParam = new URL(request.url).searchParams.get('now');
  const nowHHMM = nowParam && /^\d{1,2}:\d{2}$/.test(nowParam) ? nowParam : undefined;

  const result = await submitEnsembleAttendance({
    token: params.token,
    marksByRef,
    expectedRosterSize,
    nowHHMM,
  });
```

Replace the failure block with:

```ts
  if (!result.ok) {
    if (result.reason === 'roster_changed') {
      return NextResponse.json(
        { error: 'The roster changed — please reload before submitting.' },
        { status: 409 }
      );
    }
    if (result.reason === 'no_rehearsal') {
      return NextResponse.json(
        { error: 'No rehearsal is in session right now — please reload.' },
        { status: 409 }
      );
    }
    return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/e/[token]/submit/route.ts
git commit -m "feat(api): /e submit honors ?now= and rejects when no rehearsal is live"
```

---

### Task 5: Taker page — session header, rollover countdown, no-rehearsal card

**Files:**
- Modify: `app/e/[token]/page.tsx`

**Interfaces:**
- Consumes: GET `session` object from Task 3 (`{ status, period_number, period_name, start_time, end_time, location, next }`).
- Produces: UI only.

- [ ] **Step 1: Extend the load types**

In `interface LoadData`, replace the flat shape's top with the session-aware shape:

```ts
interface SessionInfo {
  status: 'rehearsal' | 'no_rehearsal';
  period_number: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  next: { period_name: string; start_time: string } | null;
}

interface LoadData {
  ensemble: string;
  label: string | null;
  session: SessionInfo;
  roster: RosterRow[];
  roster_size: number;
  submission: {
    marks_by_ref: Record<number, Mark> | null;
    locked: boolean;
    submitted_at: string;
    updated_at: string;
  } | null;
}
```

- [ ] **Step 2: Add a clock that drives auto-rollover**

Add near the other `useState` hooks:

```ts
  // Camp-local wall clock (HH:MM), ticked each second, used for the countdown
  // and to trigger a reload exactly when a period boundary passes.
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date())
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
```

After `load` is defined and `useEffect(load)` runs, add a boundary-watcher that reloads when the current period's `end_time` is reached (or every minute while idle, to catch the start of the next rehearsal):

```ts
  const endTime = state.kind === 'ready' ? state.data.session.end_time : null;
  const status = state.kind === 'ready' ? state.data.session.status : null;
  useEffect(() => {
    if (!clock) return;
    // In a rehearsal: when the wall clock reaches end_time, the period rolled — reload.
    // Idle: poll once a minute so the next rehearsal's start is picked up promptly.
    if (status === 'rehearsal' && endTime && clock >= endTime) load();
    if (status === 'no_rehearsal' && clock.endsWith(':00')) load();
  }, [clock, status, endTime, load]);
```

- [ ] **Step 3: Render the session header + countdown**

Replace the existing `<h1>…</h1>` + label `<p>` block at the top of the `return` with:

```tsx
      <h1 className="text-xl font-bold text-[var(--text)]">{data.ensemble}</h1>
      <p className="text-sm text-[var(--text-2)]">Attendance{data.label ? ` · ${data.label}` : ''}</p>
      {data.session.status === 'rehearsal' && data.session.period_name && (
        <div className="mt-1 flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-3 py-2">
          <span className="font-semibold text-[var(--text)]">
            {data.session.period_name} · {data.session.start_time}–{data.session.end_time}
            {data.session.location ? ` · ${data.session.location}` : ''}
          </span>
          <span className="text-xs text-[var(--text-3)]">resets at {data.session.end_time}</span>
        </div>
      )}
```

- [ ] **Step 4: Render the no-rehearsal state (early return inside `ready`)**

Immediately after `const { data } = state;` (and before computing `absentCount`/`dirty`), add:

```tsx
  if (data.session.status !== 'rehearsal') {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold text-[var(--text)]">{data.ensemble}</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">Attendance{data.label ? ` · ${data.label}` : ''}</p>
        <div className="mt-6 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface)] p-6">
          <p className="text-base font-semibold text-[var(--text)]">No rehearsal right now</p>
          <p className="mt-2 text-sm text-[var(--text-2)]">
            {data.session.next
              ? `Next: ${data.session.next.period_name} · ${data.session.next.start_time}`
              : 'Done for the day.'}
          </p>
          <p className="mt-4 text-xs text-[var(--text-3)]">This page updates automatically when your next rehearsal starts.</p>
        </div>
      </main>
    );
  }
```

- [ ] **Step 5: Handle the `no_rehearsal` submit response + reset marks on rollover**

In `submit()`, the `res.status === 409` branch already reloads; broaden its message so a rolled-over period reads sensibly:

```ts
      if (res.status === 409) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? 'Please reload — the session changed.');
        await load();
        return;
      }
```

In `load()`, after `setMarks(init)` / `setBaseline(...)`, the marks already reset to "everyone present" overlaid with this period's prior submission — so a rollover naturally clears the previous hour's marks. No extra code needed; verify in Step 6.

- [ ] **Step 6: Manual verification (dev server)**

Run: `nvm use 24 && npm run dev` (see STATUS "Run" section for the exact Node incantation), then:
1. Open `/e/<a-real-token>?now=10:20` for an ensemble that rehearses Period 3 → header shows `Period 3 · 10:00–10:50`, roster present.
2. Open `/e/<same-token>?now=12:30` → "No rehearsal right now. Next: …".
3. With `?now=10:20`, mark someone Absent → Submit → success banner; reload the same URL → mark persists for that period.
4. Open `?now=11:10` (next period) → fresh sheet, the Period-3 absence is NOT shown (different period key).

Expected: all four behave as described. (Live auto-rollover at real wall-clock boundaries is covered by the clock effect; spot-check by leaving a tab open across a `:00`.)

- [ ] **Step 7: Commit**

```bash
git add app/e/[token]/page.tsx
git commit -m "feat(e): period header + rollover countdown + no-rehearsal state on the attendance page"
```

---

### Task 6: Admin period × day attendance grid (read-only)

**Files:**
- Create: `app/api/admin/ensemble-attendance/route.ts`
- Create: `app/admin/data/sessions/EnsembleAttendanceGrid.tsx`
- Modify: the Sessions admin page (`app/admin/data/sessions/*`) to mount the grid behind a toggle (follow the existing "Master schedule" toggle pattern).

**Interfaces:**
- Consumes: `withAuth('lookup_admin', …)`; `adminDb` collection `ensemble_attendance`; `getAuthHeaders` (client) — mirror an existing admin fetch in the Sessions area.
- Produces: `GET /api/admin/ensemble-attendance` → `{ rows: Array<{ ensemble: string; day_key: string; period_number: number; period_name: string; roster_size: number; absent_count: number; submitted_at: string }> }`, sorted by `day_key`, then `period_number`, then `ensemble`.

- [ ] **Step 1: Create the API route**

```ts
// app/api/admin/ensemble-attendance/route.ts
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

interface GridRow {
  ensemble: string;
  day_key: string;
  period_number: number;
  period_name: string;
  roster_size: number;
  absent_count: number;
  submitted_at: string;
}

export const GET = withAuth('lookup_admin', async () => {
  const snap = await adminDb.collection('ensemble_attendance').get();
  const rows: GridRow[] = snap.docs.map((d) => {
    const x = d.data() as {
      ensemble?: string; day_key?: string; period_number?: number; period_name?: string;
      marks?: Record<string, 'present' | 'absent'>; roster_size?: number; submitted_at?: string;
    };
    const absent = Object.values(x.marks ?? {}).filter((m) => m === 'absent').length;
    return {
      ensemble: x.ensemble ?? '',
      day_key: x.day_key ?? '',
      period_number: x.period_number ?? 0,
      period_name: x.period_name ?? (x.period_number ? `Period ${x.period_number}` : '—'),
      roster_size: x.roster_size ?? 0,
      absent_count: absent,
      submitted_at: x.submitted_at ?? '',
    };
  });
  rows.sort((a, b) =>
    a.day_key.localeCompare(b.day_key) || a.period_number - b.period_number || a.ensemble.localeCompare(b.ensemble)
  );
  return NextResponse.json({ rows });
}, { rateLimitKey: 'admin-ensemble-attendance' });
```

> Older day-keyed docs (pre-migration) lack `period_number` → they render under "—"; harmless. New docs always carry it.

- [ ] **Step 2: Create the grid component**

```tsx
// app/admin/data/sessions/EnsembleAttendanceGrid.tsx
'use client';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-client'; // use the same import the other Sessions admin fetches use

interface GridRow {
  ensemble: string; day_key: string; period_number: number; period_name: string;
  roster_size: number; absent_count: number; submitted_at: string;
}

export default function EnsembleAttendanceGrid() {
  const [rows, setRows] = useState<GridRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/ensemble-attendance', { headers: await getAuthHeaders() });
        if (!res.ok) { setError('Could not load attendance.'); return; }
        const j = (await res.json()) as { rows: GridRow[] };
        setRows(j.rows);
      } catch { setError('Could not load attendance.'); }
    })();
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-[var(--text-3)]">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-[var(--text-3)]">No attendance taken yet.</p>;

  const days = [...new Set(rows.map((r) => r.day_key))];
  const ensembles = [...new Set(rows.map((r) => r.ensemble))].sort();
  const cell = (ens: string, day: string) =>
    rows.filter((r) => r.ensemble === ens && r.day_key === day).sort((a, b) => a.period_number - b.period_number);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-[var(--glass-border)] p-2 text-left">Ensemble</th>
            {days.map((d) => (
              <th key={d} className="border-b border-[var(--glass-border)] p-2 text-left">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ensembles.map((ens) => (
            <tr key={ens}>
              <td className="border-b border-[var(--glass-border)] p-2 font-semibold">{ens}</td>
              {days.map((d) => (
                <td key={d} className="border-b border-[var(--glass-border)] p-2 align-top">
                  <div className="flex flex-col gap-1">
                    {cell(ens, d).map((r) => (
                      <span key={r.period_number} className="whitespace-nowrap text-xs text-[var(--text-2)]">
                        {r.period_name}: {r.absent_count}/{r.roster_size} absent
                      </span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> Confirm the actual auth-header helper + import path by grepping the Sessions admin area (`grep -rn getAuthHeaders app/admin/data/sessions`); use whatever the sibling components use rather than assuming `@/lib/auth-client`.

- [ ] **Step 3: Mount behind a toggle**

In the Sessions admin page, add an "Ensemble attendance" toggle next to the existing "Master schedule" toggle and conditionally render `<EnsembleAttendanceGrid />`. Follow the existing toggle's exact pattern (state + button + conditional block).

- [ ] **Step 4: Typecheck + manual check**

Run: `npx tsc --noEmit` (expect clean), then in the dev server log in as admin, open Data ▸ Classes (Sessions), toggle "Ensemble attendance" → after taking attendance via `/e/...?now=`, rows appear keyed by day + period.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/ensemble-attendance/route.ts app/admin/data/sessions/EnsembleAttendanceGrid.tsx app/admin/data/sessions
git commit -m "feat(admin): read-only ensemble attendance period×day grid"
```

---

### Task 7: Full suite + lint gate

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass (the existing 508 + the new ~10), including `tests/unit/no-external-egress.test.ts`.

- [ ] **Step 2: Build**

Run: `nvm use 24 && npm run build`
Expected: Next build succeeds.

- [ ] **Step 3: Commit any lint/format fixups**

```bash
git add -A && git commit -m "chore: hourly ensemble attendance — suite green + build" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Period-aware "current session" → Task 1 (resolver) + Task 2 (`getCurrentEnsembleSession`). ✓
- Gate on real schedule → Task 1 (`type==='rehearsal'` filter). ✓
- Same links / no re-issue → no change to `ensemble_links`; tokens untouched. ✓
- Per-day-and-period keying + reset on rollover → Task 2 (`docId`) + Task 5 (`load` resets marks). ✓
- Reports stamped per period → Task 2 (`session_label`/`session_id`/`period_*` in `buildCaseDoc`). ✓
- Admin sees everything per period → Task 6 grid + existing hub (reports flow unchanged). ✓
- `?now=` override on display **and** submit → Tasks 3 & 4. ✓
- No external contact / egress guard → unchanged; Task 7 runs the guard. ✓

**Placeholder scan:** Task 6 leaves the auth-header import path to confirm-by-grep (the only deliberately codebase-dependent bit, called out explicitly) and the Sessions toggle mount as "follow existing pattern" — acceptable because it mirrors the already-shipped "Master schedule" toggle. All logic-bearing steps carry complete code.

**Type consistency:** `EnsembleNow`/`ScheduleSlot` (Task 1) → consumed as typed in Task 2; `CurrentPeriod`/`EnsembleSessionContext` (Task 2) → consumed in Tasks 3/5; `SubmitResult` gains `'no_rehearsal'` (Task 2) → handled in Task 4. `docId(token, day, period)` arity changed in Task 2 and every caller (`getEnsembleSubmission`, `submitEnsembleAttendance`) updated in the same task. Grid row shape identical in Task 6 API + component.

**Scope:** Single subsystem (one attendance flow). No decomposition needed.
