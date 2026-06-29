# Timeline Edits, Ensemble Awareness, Hourly Archive, Newest-First — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the office add timeline notes; let ensemble leaders see and update a student's incident from the `/e` roster; group still-active incidents by "this hour" vs "carried over"; order incidents newest-first.

**Architecture:** Mostly reuse. Phase 1 surfaces the already-wired `note` event in the UI. Phase 2 mirrors the `/r` staff-link two-way thread, scoped by the ensemble token + the existing opaque `ref` (index into the server's id-sorted roster), with a new no-dorm projection. Phases 3–4 are client-side display logic on the active board (a pure, testable partition+sort helper) plus a within-hour sort audit on other lists. No schema or index changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (Admin SDK), Vitest, Tailwind with the project's `--var` semantic classes.

## Global Constraints

- **Node 24 only.** `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` before `npm test`/build/deploy.
- **Never widen the public projection.** Tokenized public routes (`/e`, `/r`) return allowlisted shapes built field-by-field — never spread a Firestore doc. The ensemble incident projection MUST omit dorm, medical, parent contact, cell, raw text, student_id, reporter, and other students.
- **`ref` is the opaque index** into the server's id-sorted roster (`getRosterForToken(token).roster`), stable between calls. Never expose or accept a real student/case id on a public route.
- **Uniform 404** for unknown/revoked/expired tokens and out-of-range refs on public GET; **410** for an update against a missing/resolved case. No enumeration signal.
- **Per-IP rate limiting** on every public route (`checkRateLimit`), plus a durable per-token cap on the public write (mirror `r-update`).
- **No cron / scheduled function.** Phase 3 hourly archive is display-only; it never changes a case's `status`.
- **Camp timezone** comes from `lib/date.ts` (`hourBucket`, `formatClock`, `DEFAULT_CAMP_TZ`). Never hand-roll tz math.
- **TDD + frequent commits.** Vitest unit tests under `tests/unit/{lib,api,app}/`.

---

## Phase 1 — Add to the timeline (admin)

### Task 1: `AddTimelineNote` component + wire into case detail

**Files:**
- Create: `app/admin/cases/[id]/AddTimelineNote.tsx`
- Modify: `app/admin/cases/[id]/page.tsx` (Timeline section, ~lines 301–324; import at top)
- Test: `tests/unit/app/add-timeline-note.test.tsx`

**Interfaces:**
- Produces: `AddTimelineNote({ onSubmit }: { onSubmit: (body: string) => Promise<void> }): JSX.Element`
- Consumes (in page): existing `logEvent('note', body)` helper at `app/admin/cases/[id]/page.tsx:131`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/app/add-timeline-note.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddTimelineNote } from '@/app/admin/cases/[id]/AddTimelineNote';

describe('AddTimelineNote', () => {
  it('disables the button when empty and enables when there is text', () => {
    render(<AddTimelineNote onSubmit={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /add to timeline/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/add a note/i), { target: { value: 'called mom' } });
    expect(btn).toBeEnabled();
  });

  it('calls onSubmit with the trimmed body and clears the box', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddTimelineNote onSubmit={onSubmit} />);
    const box = screen.getByPlaceholderText(/add a note/i) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '  found in dorm  ' } });
    fireEvent.click(screen.getByRole('button', { name: /add to timeline/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('found in dorm'));
    await waitFor(() => expect(box.value).toBe(''));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/add-timeline-note.test.tsx`
Expected: FAIL — cannot find module `AddTimelineNote`.

- [ ] **Step 3: Write the component**

```tsx
// app/admin/cases/[id]/AddTimelineNote.tsx
'use client';

import { useState } from 'react';

/** Free-text note/comment box appended to a case's timeline. The parent owns the
 * POST (via the page's logEvent('note', …)); this just collects + clears text. */
export function AddTimelineNote({ onSubmit }: { onSubmit: (body: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  async function submit() {
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setText('');
    } catch {
      setError('Could not add the note. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note or comment to the timeline…"
        className="h-16 w-full rounded border p-2 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !trimmed}
        className="mt-1 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add to timeline'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/app/add-timeline-note.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the case detail page**

In `app/admin/cases/[id]/page.tsx`, add the import near the other local imports (after line 13):

```tsx
import { AddTimelineNote } from './AddTimelineNote';
```

Then in the Timeline `<section>` (currently lines 301–324), render the box directly under the `<h2>Timeline</h2>` heading, before the `<ol>`:

```tsx
      <section className="mt-6">
        <h2 className="font-semibold">Timeline</h2>
        <AddTimelineNote onSubmit={(body) => logEvent('note', body)} />
        <ol className="mt-2 flex flex-col gap-1 text-sm">
```

Leave the rest of the section unchanged. (The box shows for both active and resolved cases — `logEvent` already POSTs unconditionally and the route has no status gate.)

- [ ] **Step 6: Run the full unit suite + typecheck**

Run: `npx vitest run tests/unit/app/add-timeline-note.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/admin/cases/[id]/AddTimelineNote.tsx app/admin/cases/[id]/page.tsx tests/unit/app/add-timeline-note.test.tsx
git commit -m "feat(cases): add note/comment box to the timeline"
```

---

## Phase 2 — Ensemble roster → student incident layer

### Task 2: `toEnsembleIncidentProjection` (no-dorm scoped projection)

**Files:**
- Modify: `lib/projections.ts` (append after `toStaffLinkProjection`, ~line 114)
- Test: `tests/unit/lib/projections.test.ts` (append)

**Interfaces:**
- Produces:
  - `interface EnsembleIncidentProjection { first_name: string; last_initial: string; instrument: string; report_summary: string; status: CaseStatus; updates: StaffLinkUpdate[] }`
  - `toEnsembleIncidentProjection(c: Case, student: Student | null, events: CaseEvent[]): EnsembleIncidentProjection`

- [ ] **Step 1: Write the failing test** (append to `tests/unit/lib/projections.test.ts`)

```ts
import { toEnsembleIncidentProjection } from '@/lib/projections';

describe('toEnsembleIncidentProjection', () => {
  const student = {
    first_name: 'Jane', preferred_name: '', last_name: 'Doe', instrument: 'Flute',
    dorm_building: 'Wall', dorm_room: '214', medical_notes: 'asthma',
    parent_phone: '555', cell_phone: '556',
  } as any;
  const c = { summary: 'Absent from Band 5', status: 'active' } as any;
  const events = [
    { type: 'note', body: 'internal only', actor: 'david@x', created_at: '2026-06-29T18:00:00Z' },
    { type: 'staff_update', body: 'checking dorm', actor: 'Counselor', created_at: '2026-06-29T18:05:00Z' },
  ] as any;

  it('omits dorm and all PII beyond first name + last initial + instrument', () => {
    const p = toEnsembleIncidentProjection(c, student, events);
    expect(p).toEqual({
      first_name: 'Jane',
      last_initial: 'D.',
      instrument: 'Flute',
      report_summary: 'Absent from Band 5',
      status: 'active',
      updates: [{ body: 'checking dorm', actor: 'Camp staff', created_at: '2026-06-29T18:05:00Z' }],
    });
    expect(JSON.stringify(p)).not.toMatch(/Wall|214|asthma|555|556/);
  });

  it('includes only staff_update events, with a neutral author', () => {
    const p = toEnsembleIncidentProjection(c, student, events);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].actor).toBe('Camp staff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/projections.test.ts`
Expected: FAIL — `toEnsembleIncidentProjection` is not exported.

- [ ] **Step 3: Implement** (append to `lib/projections.ts`)

```ts
/**
 * Scoped projection for the public ensemble incident layer (`/e/<token>` →
 * tap a flagged student). Awareness-only audience: like the staff link but
 * WITHOUT dorm/room (an ensemble leader needs to know what's going on, not to
 * locate the kid). Allowlist — never the full surname, dorm, medical, parent
 * contact, cell, raw text, student_id, reporter, schedule, or other students.
 * `updates` carries ONLY staff_update events under a neutral author.
 */
export interface EnsembleIncidentProjection {
  first_name: string;
  last_initial: string;
  instrument: string;
  report_summary: string;
  status: CaseStatus;
  updates: StaffLinkUpdate[];
}

export function toEnsembleIncidentProjection(
  c: Case,
  student: Student | null,
  events: CaseEvent[]
): EnsembleIncidentProjection {
  const lastName = student?.last_name ?? '';
  return {
    first_name: student?.preferred_name || student?.first_name || '',
    last_initial: lastName ? `${lastName.charAt(0)}.` : '',
    instrument: student?.instrument ?? '',
    report_summary: c.summary,
    status: c.status,
    updates: events
      .filter((e) => e.type === 'staff_update')
      .map((e) => ({ body: e.body, actor: 'Camp staff', created_at: e.created_at })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/projections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/projections.ts tests/unit/lib/projections.test.ts
git commit -m "feat(projections): no-dorm ensemble incident projection"
```

### Task 3: `lib/ensemble-incidents.ts` — token+ref → incident resolution

**Files:**
- Create: `lib/ensemble-incidents.ts`
- Test: `tests/unit/lib/ensemble-incidents.test.ts`

**Interfaces:**
- Consumes: `getRosterForToken` (`lib/ensemble-attendance.ts`) → `{ ensemble, label, roster: Student[] } | null`; `listCases`, `listCasesForStudent`, `listCaseEvents`, `addCaseEvent`, `getCase` (`lib/cases.ts`); `getStudent` (`lib/firestore.ts`); `toEnsembleIncidentProjection` (Task 2).
- Produces:
  - `listActiveIncidentRefs(token: string): Promise<number[] | null>` — refs (roster indices) with an active case; `null` if token invalid.
  - `getEnsembleIncidentByRef(token: string, ref: number): Promise<EnsembleIncidentProjection | null>` — `null` if token invalid, ref out of range, or no active case.
  - `postEnsembleIncidentUpdate(token: string, ref: number, body: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'gone' }>` — appends a `staff_update` event authored by the ensemble label; `gone` if no active case.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/lib/ensemble-incidents.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  roster: [] as any[],
  ensemble: 'Band 5',
  rosterNull: false,
  activeCases: [] as any[],
  studentCases: {} as Record<string, any[]>,
  events: [] as any[],
  added: [] as any[],
}));

vi.mock('@/lib/ensemble-attendance', () => ({
  getRosterForToken: async () =>
    h.rosterNull ? null : { ensemble: h.ensemble, label: null, roster: h.roster },
}));
vi.mock('@/lib/cases', () => ({
  listCases: async () => h.activeCases,
  listCasesForStudent: async (id: string) => h.studentCases[id] ?? [],
  listCaseEvents: async () => h.events,
  addCaseEvent: async (caseId: string, type: string, body: string, actor: string) => {
    h.added.push({ caseId, type, body, actor });
    return 'evt1';
  },
  getCase: async (id: string) => (h.studentCases['x']?.find((c) => c.id === id) ?? null),
}));
vi.mock('@/lib/firestore', () => ({ getStudent: async () => null }));

import {
  listActiveIncidentRefs,
  getEnsembleIncidentByRef,
  postEnsembleIncidentUpdate,
} from '@/lib/ensemble-incidents';

beforeEach(() => {
  h.roster = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  h.ensemble = 'Band 5';
  h.rosterNull = false;
  h.activeCases = [];
  h.studentCases = {};
  h.events = [];
  h.added = [];
});

describe('listActiveIncidentRefs', () => {
  it('returns the roster indices whose student has an active case', async () => {
    h.activeCases = [{ id: 'c2', student_id: 's2', status: 'active' }];
    expect(await listActiveIncidentRefs('tok')).toEqual([1]);
  });
  it('returns null for an invalid token', async () => {
    h.rosterNull = true;
    expect(await listActiveIncidentRefs('tok')).toBeNull();
  });
  it('ignores active cases for students not in this roster', async () => {
    h.activeCases = [{ id: 'cX', student_id: 'other', status: 'active' }];
    expect(await listActiveIncidentRefs('tok')).toEqual([]);
  });
});

describe('getEnsembleIncidentByRef', () => {
  it('returns the scoped projection for the active case at that ref', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'Absent', status: 'active' }];
    const p = await getEnsembleIncidentByRef('tok', 1);
    expect(p?.report_summary).toBe('Absent');
    expect(p).not.toHaveProperty('dorm_building');
  });
  it('returns null when the ref is out of range', async () => {
    expect(await getEnsembleIncidentByRef('tok', 9)).toBeNull();
  });
  it('returns null when the ref has no active case', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'old', status: 'resolved' }];
    expect(await getEnsembleIncidentByRef('tok', 1)).toBeNull();
  });
});

describe('postEnsembleIncidentUpdate', () => {
  it('appends a staff_update authored by the ensemble label', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'Absent', status: 'active' }];
    const r = await postEnsembleIncidentUpdate('tok', 1, 'in the hall');
    expect(r).toEqual({ ok: true });
    expect(h.added).toEqual([{ caseId: 'c2', type: 'staff_update', body: 'in the hall', actor: 'Band 5' }]);
  });
  it('returns gone when there is no active case at the ref', async () => {
    h.studentCases['s2'] = [];
    expect(await postEnsembleIncidentUpdate('tok', 1, 'x')).toEqual({ ok: false, reason: 'gone' });
  });
  it('returns invalid for a bad token', async () => {
    h.rosterNull = true;
    expect(await postEnsembleIncidentUpdate('tok', 1, 'x')).toEqual({ ok: false, reason: 'invalid' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/ensemble-incidents.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/ensemble-incidents.ts
import { getRosterForToken } from './ensemble-attendance';
import { listCases, listCasesForStudent, listCaseEvents, addCaseEvent } from './cases';
import { getStudent } from './firestore';
import { toEnsembleIncidentProjection, type EnsembleIncidentProjection } from './projections';

/** First active case for a student, or null. */
async function activeCaseFor(studentId: string) {
  const cases = await listCasesForStudent(studentId);
  return cases.find((c) => c.status === 'active') ?? null;
}

/** Roster indices (refs) whose student has at least one active case. Scopes to
 * THIS ensemble's server-derived roster — a leaked token can only see its own
 * kids. Returns null for an invalid token. */
export async function listActiveIncidentRefs(token: string): Promise<number[] | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const idToRef = new Map<string, number>();
  rosterData.roster.forEach((s, i) => idToRef.set(s.id, i));
  const active = await listCases('active');
  const refs: number[] = [];
  for (const c of active) {
    const ref = idToRef.get(c.student_id);
    if (ref !== undefined) refs.push(ref);
  }
  return refs.sort((a, b) => a - b);
}

/** Scoped incident projection for the student at `ref`, or null (invalid token,
 * out-of-range ref, or no active case). */
export async function getEnsembleIncidentByRef(
  token: string,
  ref: number
): Promise<EnsembleIncidentProjection | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const student = rosterData.roster[ref];
  if (!student) return null;
  const c = await activeCaseFor(student.id);
  if (!c) return null;
  const [full, events] = await Promise.all([getStudent(student.id), listCaseEvents(c.id)]);
  return toEnsembleIncidentProjection(c, full ?? student, events);
}

/** Append a staff_update to the active case at `ref`, authored by the ensemble
 * label. Server re-derives the roster + case from the token — never trusts a
 * client id. */
export async function postEnsembleIncidentUpdate(
  token: string,
  ref: number,
  body: string
): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'gone' }> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return { ok: false, reason: 'invalid' };
  const student = rosterData.roster[ref];
  if (!student) return { ok: false, reason: 'invalid' };
  const c = await activeCaseFor(student.id);
  if (!c) return { ok: false, reason: 'gone' };
  await addCaseEvent(c.id, 'staff_update', body, rosterData.ensemble);
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/ensemble-incidents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ensemble-incidents.ts tests/unit/lib/ensemble-incidents.test.ts
git commit -m "feat(ensemble): token+ref incident resolution helpers"
```

### Task 4: Incident detail + update routes

**Files:**
- Create: `app/api/e/[token]/incident/[ref]/route.ts` (GET)
- Create: `app/api/e/[token]/incident/[ref]/update/route.ts` (POST)
- Modify: `app/api/e/[token]/route.ts` (attach `incident_refs`)
- Test: `tests/unit/api/ensemble-incident.test.ts`

**Interfaces:**
- Consumes: Task 3 helpers; `checkRateLimit`, `checkRateLimitDurable`, `getClientIp` (`lib/rate-limit.ts`).
- Produces: `GET /api/e/<token>/incident/<ref>` → `{ incident: EnsembleIncidentProjection }` (200) or uniform 404; `POST …/update` → `{ id }` (200) / 400 / 410 / 429. `GET /api/e/<token>` response gains `incident_refs: number[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/api/ensemble-incident.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  refs: null as number[] | null,
  detail: null as any,
  update: { ok: true } as any,
  rl: true,
  rlDurable: true,
}));

vi.mock('@/lib/ensemble-incidents', () => ({
  listActiveIncidentRefs: async () => h.refs,
  getEnsembleIncidentByRef: async () => h.detail,
  postEnsembleIncidentUpdate: async () => h.update,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => h.rl,
  checkRateLimitDurable: async () => h.rlDurable,
  getClientIp: () => '1.2.3.4',
}));

import { GET } from '@/app/api/e/[token]/incident/[ref]/route';
import { POST } from '@/app/api/e/[token]/incident/[ref]/update/route';

function req(body?: unknown) {
  return new Request('http://x', {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

beforeEach(() => {
  h.refs = null; h.detail = null; h.update = { ok: true }; h.rl = true; h.rlDurable = true;
});

describe('GET incident detail', () => {
  it('200 with the scoped incident', async () => {
    h.detail = { first_name: 'Jane', last_initial: 'D.', instrument: 'Flute', report_summary: 'Absent', status: 'active', updates: [] };
    const res = await GET(req(), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).incident.first_name).toBe('Jane');
  });
  it('uniform 404 when no active incident at the ref', async () => {
    h.detail = null;
    const res = await GET(req(), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(404);
  });
  it('400 on a non-numeric ref', async () => {
    const res = await GET(req(), { params: { token: 't', ref: 'abc' } });
    expect(res.status).toBe(400);
  });
  it('429 when rate-limited', async () => {
    h.rl = false;
    const res = await GET(req(), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(429);
  });
});

describe('POST incident update', () => {
  it('200 on a valid update', async () => {
    const res = await POST(req({ body: 'in the hall' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(200);
  });
  it('400 on empty body', async () => {
    const res = await POST(req({ body: '   ' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(400);
  });
  it('410 when the case is gone/resolved', async () => {
    h.update = { ok: false, reason: 'gone' };
    const res = await POST(req({ body: 'x' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(410);
  });
  it('410 when the token is invalid', async () => {
    h.update = { ok: false, reason: 'invalid' };
    const res = await POST(req({ body: 'x' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/ensemble-incident.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement the GET detail route**

```ts
// app/api/e/[token]/incident/[ref]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getEnsembleIncidentByRef } from '@/lib/ensemble-incidents';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string; ref: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e-incident:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const ref = Number(params.ref);
  if (!Number.isInteger(ref) || ref < 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const incident = await getEnsembleIncidentByRef(params.token, ref);
  if (!incident) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  return NextResponse.json({ incident });
};
```

- [ ] **Step 4: Implement the POST update route**

```ts
// app/api/e/[token]/incident/[ref]/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { postEnsembleIncidentUpdate } from '@/lib/ensemble-incidents';
import { checkRateLimit, checkRateLimitDurable, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export const POST = async (
  request: NextRequest,
  { params }: { params: { token: string; ref: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e-incident-update:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  if (!(await checkRateLimitDurable(`e-incident-update:${params.token}`, { max: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const ref = Number(params.ref);
  if (!Number.isInteger(ref) || ref < 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const json = await request.json().catch(() => null);
  const text = (json as { body?: unknown })?.body;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Update text required' }, { status: 400 });
  }
  if (text.trim().length > 2000) {
    return NextResponse.json({ error: 'Update is too long.' }, { status: 400 });
  }
  const r = await postEnsembleIncidentUpdate(params.token, ref, text.trim());
  if (!r.ok) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 410 });
  return NextResponse.json({ id: 'ok' });
};
```

- [ ] **Step 5: Attach `incident_refs` to the ensemble GET**

In `app/api/e/[token]/route.ts`, add the import:

```ts
import { listActiveIncidentRefs } from '@/lib/ensemble-incidents';
```

After the roster is built (after line 51 `const roster = toEnsembleRosterProjection(...)`), compute the refs and include them in the final JSON. Add before the `return`:

```ts
  const incident_refs = (await listActiveIncidentRefs(params.token)) ?? [];
```

Then add `incident_refs,` to the returned object (alongside `roster`, `roster_size`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/api/ensemble-incident.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add "app/api/e/[token]/incident" "app/api/e/[token]/route.ts" tests/unit/api/ensemble-incident.test.ts
git commit -m "feat(ensemble): incident detail + update routes; flag refs on roster GET"
```

### Task 5: `StudentIncidentLayer` modal + roster integration

**Files:**
- Create: `app/e/[token]/StudentIncidentLayer.tsx`
- Modify: `app/e/[token]/page.tsx` (LoadData type; badges; pinned section; modal state)
- Test: `tests/unit/app/student-incident-layer.test.tsx`

**Interfaces:**
- Consumes: `GET /api/e/<token>/incident/<ref>`, `POST …/update`; `components/Modal.tsx` (`Modal({ open, title, onClose, children })`).
- Produces: `StudentIncidentLayer({ token, refIndex, name, nowQuery, onClose }: { token: string; refIndex: number; name: string; nowQuery: string; onClose: () => void }): JSX.Element`. `page.tsx` `LoadData` gains `incident_refs: number[]`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/app/student-incident-layer.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentIncidentLayer } from '@/app/e/[token]/StudentIncidentLayer';

const incident = {
  first_name: 'Jane', last_initial: 'D.', instrument: 'Flute',
  report_summary: 'Absent from Band 5', status: 'active',
  updates: [{ body: 'checking dorm', actor: 'Camp staff', created_at: '2026-06-29T18:05:00Z' }],
};

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (opts?.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'ok' }) } as any;
    return { ok: true, status: 200, json: async () => ({ incident }) } as any;
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('StudentIncidentLayer', () => {
  it('loads and shows the incident timeline', async () => {
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Absent from Band 5')).toBeInTheDocument());
    expect(screen.getByText('checking dorm')).toBeInTheDocument();
  });

  it('posts an update and clears the box', async () => {
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Absent from Band 5'));
    const box = screen.getByPlaceholderText(/add an update/i) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'in the hall' } });
    fireEvent.click(screen.getByRole('button', { name: /send update/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/e/t/incident/1/update',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await waitFor(() => expect(box.value).toBe(''));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/student-incident-layer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the layer**

```tsx
// app/e/[token]/StudentIncidentLayer.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';

interface Update { body: string; actor: string; created_at: string }
interface Incident {
  first_name: string; last_initial: string; instrument: string;
  report_summary: string; status: 'active' | 'resolved'; updates: Update[];
}

/** Pop-up layer on the ensemble roster: shows a flagged student's incident
 * timeline (scoped, no dorm) and a two-way "add update" box that posts back to
 * the office. Polls every 30s (pause-on-hidden) and flashes when the office
 * adds something. Mirrors /r. */
export function StudentIncidentLayer({
  token, refIndex, name, nowQuery, onClose,
}: { token: string; refIndex: number; name: string; nowQuery: string; onClose: () => void }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const prevCount = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/${token}/incident/${refIndex}${nowQuery}`);
      if (res.status === 429) return;
      if (!res.ok) { setInvalid(true); return; }
      const data = (await res.json()) as { incident: Incident };
      const count = data.incident.updates.length;
      if (prevCount.current !== null && count > prevCount.current) {
        setFlash(true);
        setTimeout(() => setFlash(false), 4000);
      }
      prevCount.current = count;
      setIncident(data.incident);
    } catch {
      setInvalid(true);
    }
  }, [token, refIndex, nowQuery]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const i = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => clearInterval(i);
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/e/${token}/incident/${refIndex}/update${nowQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) { setError('Could not send your update. Please try again.'); return; }
      setDraft('');
      await load();
    } catch {
      setError('Could not send your update. Please try again.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <Modal open title={name} onClose={onClose}>
      {flash && (
        <div className="mb-3 rounded bg-yellow-100 p-2 text-center text-sm text-yellow-900">
          ↻ Updated from the camp office
        </div>
      )}
      {invalid && <p className="text-sm text-[var(--text-3)]">No active incident for this student.</p>}
      {!invalid && !incident && <p className="text-sm text-[var(--text-3)]">Loading…</p>}
      {incident && (
        <div className="text-sm">
          <span
            className={
              incident.status === 'resolved'
                ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                : 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
            }
          >
            {incident.status === 'resolved' ? 'Resolved' : 'Active'}
          </span>
          <p className="mt-2 text-[var(--text)]">{incident.report_summary}</p>

          <h3 className="mt-4 text-sm font-semibold text-[var(--text-2)]">Timeline</h3>
          <ol className="mt-2 flex flex-col gap-2">
            {incident.updates.length === 0 && <li className="text-[var(--text-3)]">No updates yet.</li>}
            {incident.updates.map((u, i) => (
              <li key={i} className="rounded border-l-4 border-blue-400 bg-blue-50 p-2">
                <span className="text-xs text-[var(--text-3)]">
                  {new Date(u.created_at).toLocaleString()} · {u.actor}
                </span>
                <p className="whitespace-pre-wrap break-words">{u.body}</p>
              </li>
            ))}
          </ol>

          {incident.status === 'active' && (
            <div className="mt-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add an update for the camp office…"
                className="h-20 w-full rounded border p-2 text-sm"
              />
              {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
              <button
                onClick={send}
                disabled={posting || !draft.trim()}
                className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {posting ? 'Sending…' : 'Send update'}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/app/student-incident-layer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Integrate into the roster page**

In `app/e/[token]/page.tsx`:

1. Add the import:
```tsx
import { StudentIncidentLayer } from './StudentIncidentLayer';
```

2. Extend `LoadData` (after `roster_size: number;`):
```tsx
  incident_refs: number[];
```

3. Add modal state near the other `useState`s (e.g. after `forcedHour`):
```tsx
  const [openIncidentRef, setOpenIncidentRef] = useState<number | null>(null);
```

4. Derive a flagged set once `data` exists (inside the render, after `const { data } = state;`):
```tsx
  const flaggedRefs = new Set(data.incident_refs ?? []);
  const flaggedRows = data.roster.filter((r) => flaggedRefs.has(r.ref));
```

5. Render a pinned "Needs attention" section ABOVE the sort toggle / instrument groups (right after the "No rehearsal" / submission blocks, before the `<div className="mt-3 flex items-center justify-between">` sort row):
```tsx
      {flaggedRows.length > 0 && (
        <section className="mt-3 rounded-[var(--radius-sm)] border border-red-300 bg-red-50 p-2">
          <h2 className="text-sm font-bold text-red-800">Needs attention — {flaggedRows.length}</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {flaggedRows.map((r) => (
              <li key={r.ref}>
                <button
                  onClick={() => setOpenIncidentRef(r.ref)}
                  className="flex w-full items-center justify-between rounded border border-red-200 bg-white px-3 py-2 text-left text-sm"
                >
                  <span className="font-medium text-[var(--text)]">🔴 {r.first_name} {r.last_name}</span>
                  <span className="text-xs text-red-700">View incident →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
```

6. In `renderRow`, add a flag badge for flagged students next to the name (inside the `min-w-0` div, after the instrument/grade `<p>`):
```tsx
          {flaggedRefs.has(r.ref) && (
            <button
              onClick={() => setOpenIncidentRef(r.ref)}
              className="mt-0.5 text-xs font-semibold text-red-700 underline"
            >
              🔴 incident — view
            </button>
          )}
```
(Note: `renderRow` already closes over component scope, so `flaggedRefs`/`setOpenIncidentRef` are in scope. Verify `flaggedRefs` is declared before `renderRow` uses it — move the `flaggedRefs`/`flaggedRows` derivation up to just after `const { data } = state;`, which precedes `renderRow`'s definition.)

7. Render the layer at the end of the `<main>` (before its closing tag):
```tsx
      {openIncidentRef !== null && (
        <StudentIncidentLayer
          token={token}
          refIndex={openIncidentRef}
          name={(() => {
            const r = data.roster.find((x) => x.ref === openIncidentRef);
            return r ? `${r.first_name} ${r.last_name}` : 'Student';
          })()}
          nowQuery={nowQuery}
          onClose={() => { setOpenIncidentRef(null); load(); }}
        />
      )}
```
(The `load()` on close refreshes `incident_refs` so a just-resolved student drops the flag.)

- [ ] **Step 6: Run the suite + typecheck**

Run: `npx vitest run tests/unit/app/student-incident-layer.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add "app/e/[token]/StudentIncidentLayer.tsx" "app/e/[token]/page.tsx" tests/unit/app/student-incident-layer.test.tsx
git commit -m "feat(ensemble): tap a flagged student to view/update their incident"
```

---

## Phase 3 + 4 — Carried-over hour grouping + newest-first

### Task 6: `partitionActiveByHour` helper (newest-first groups)

**Files:**
- Create: `lib/active-board.ts`
- Test: `tests/unit/lib/active-board.test.ts`

**Interfaces:**
- Consumes: `hourBucket` (`lib/date.ts`), `Case` (`lib/cases.ts`).
- Produces: `partitionActiveByHour(cases: Case[], nowHourKey: string): { thisHour: Case[]; carriedOver: Case[] }` — each group sorted **newest-first** by `occurred_at` (fallback `created_at`). `nowHourKey` is a `hourBucket()` string (`"YYYY-MM-DD HH"`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/lib/active-board.test.ts
import { describe, it, expect } from 'vitest';
import { partitionActiveByHour } from '@/lib/active-board';
import { hourBucket } from '@/lib/date';

const mk = (id: string, iso: string) => ({ id, occurred_at: iso, created_at: iso }) as any;

describe('partitionActiveByHour', () => {
  // Use camp-tz hour buckets so the test is tz-correct.
  const a = mk('a', '2026-06-29T19:10:00Z'); // hour X
  const b = mk('b', '2026-06-29T19:40:00Z'); // hour X (later)
  const c = mk('c', '2026-06-29T18:30:00Z'); // hour X-1
  const nowKey = hourBucket('2026-06-29T19:50:00Z');

  it('splits this-hour from carried-over (older still-active)', () => {
    const { thisHour, carriedOver } = partitionActiveByHour([c, a, b], nowKey);
    expect(thisHour.map((x) => x.id)).toEqual(['b', 'a']); // newest-first
    expect(carriedOver.map((x) => x.id)).toEqual(['c']);
  });

  it('orders each group newest-first', () => {
    const { thisHour } = partitionActiveByHour([a, b], nowKey);
    expect(thisHour.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('puts everything in carried-over when nothing is in the current hour', () => {
    const futureKey = hourBucket('2026-06-29T23:50:00Z');
    const { thisHour, carriedOver } = partitionActiveByHour([a, b, c], futureKey);
    expect(thisHour).toEqual([]);
    expect(carriedOver.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/active-board.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/active-board.ts
import { hourBucket } from './date';
import type { Case } from './cases';

const stamp = (c: Case) => c.occurred_at || c.created_at;

/** Split active cases into the current clock hour vs older still-active
 * ("carried over") ones, each newest-first. Display-only — never changes a
 * case's status, so a missing kid stays visible (just grouped + flagged). */
export function partitionActiveByHour(
  cases: Case[],
  nowHourKey: string
): { thisHour: Case[]; carriedOver: Case[] } {
  const newestFirst = (a: Case, b: Case) =>
    new Date(stamp(b)).getTime() - new Date(stamp(a)).getTime();
  const thisHour: Case[] = [];
  const carriedOver: Case[] = [];
  for (const c of cases) {
    if (hourBucket(stamp(c)) === nowHourKey) thisHour.push(c);
    else carriedOver.push(c);
  }
  thisHour.sort(newestFirst);
  carriedOver.sort(newestFirst);
  return { thisHour, carriedOver };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/active-board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/active-board.ts tests/unit/lib/active-board.test.ts
git commit -m "feat(cases): partition active board into this-hour vs carried-over, newest-first"
```

### Task 7: Render the two groups on the active board

**Files:**
- Modify: `app/admin/cases/page.tsx` (replace the `sorted` computation + the cards `<section>`, lines ~142–233)
- Test: covered by Task 6 (pure helper); this is a wiring change verified by typecheck + manual smoke.

**Interfaces:**
- Consumes: `partitionActiveByHour` (Task 6); `hourBucket`, `getTodayDate` (`lib/date.ts`).

- [ ] **Step 1: Add imports**

In `app/admin/cases/page.tsx`, add:
```tsx
import { partitionActiveByHour } from '@/lib/active-board';
import { hourBucket, getTodayDate } from '@/lib/date';
```

- [ ] **Step 2: Replace the `sorted` block (lines ~142–149)**

Replace:
```tsx
  // Flat list, MOST URGENT FIRST (longest elapsed = oldest occurred_at). Never
  // collapsed — auto-hiding a still-missing kid would be a safety bug.
  const sorted = [...cases].sort(
    (a, b) =>
      new Date(a.occurred_at || a.created_at).getTime() -
      new Date(b.occurred_at || b.created_at).getTime()
  );
  const selectedCaseIds = sorted.filter((c) => selected.has(c.id)).map((c) => c.id);
```
with:
```tsx
  // Newest-first, split into the current clock hour vs older still-active
  // ("carried over") incidents. Carried-over kids stay visible (never hidden);
  // CaseCard's elapsed badge keeps urgency legible. ?now=HH:MM overrides the hour.
  const nowHourKey = nowOverride
    ? hourBucket(`${getTodayDate()}T${nowOverride}:00`)
    : hourBucket(new Date().toISOString());
  const { thisHour, carriedOver } = partitionActiveByHour(cases, nowHourKey);
  const sorted = [...thisHour, ...carriedOver];
  const selectedCaseIds = sorted.filter((c) => selected.has(c.id)).map((c) => c.id);
```

- [ ] **Step 3: Replace the cards `<section>` (lines ~210–233)**

Replace the single `.map` section with two labelled groups (keep the loading + empty states):
```tsx
      <section className="mt-4 flex flex-col gap-2">
        {loading && <p className="text-sm text-[var(--text-3)]">Loading…</p>}
        {!loading && sorted.length === 0 && (
          <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            No active reports. 🎺
          </p>
        )}

        {thisHour.map((c) => (
          <CaseCard
            key={c.id}
            c={c}
            selected={selected.has(c.id)}
            onToggleSelect={toggleSelect}
            nowOverride={nowOverride}
            updateFlag={
              isUnseen(c, seen, { treatUnknownAsNew: true })
                ? seen[c.id] !== undefined ? 'updated' : 'new'
                : null
            }
          />
        ))}

        {carriedOver.length > 0 && (
          <>
            <h2 className="mt-4 text-sm font-semibold text-amber-700">
              ⏱ Carried over from earlier — {carriedOver.length}
            </h2>
            {carriedOver.map((c) => (
              <CaseCard
                key={c.id}
                c={c}
                selected={selected.has(c.id)}
                onToggleSelect={toggleSelect}
                nowOverride={nowOverride}
                updateFlag={
                  isUnseen(c, seen, { treatUnknownAsNew: true })
                    ? seen[c.id] !== undefined ? 'updated' : 'new'
                    : null
                }
              />
            ))}
          </>
        )}
      </section>
```

- [ ] **Step 4: Typecheck + run the cases-related suites**

Run: `npx tsc --noEmit && npx vitest run tests/unit/lib/active-board.test.ts`
Expected: no type errors; PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cases/page.tsx
git commit -m "feat(cases): active board shows this-hour + carried-over groups, newest-first"
```

### Task 8: Newest-first audit on the other lists

**Files:**
- Modify: `app/admin/cases/ReportHistory.tsx` (ensure within-hour newest-first)
- Modify (if needed): `components/EnsembleAttendanceGrid.tsx` (or wherever the admin ensemble grid lists by time)
- Test: `tests/unit/app/report-history-order.test.tsx` (only if a sortable unit is extracted; otherwise verify by reading + manual smoke)

**Interfaces:**
- Consumes: existing `hourBucket`, `formatClock`.

- [ ] **Step 1: Inspect ReportHistory within-hour ordering**

Run: `npx --yes --silent grep --version >/dev/null 2>&1; sed -n '95,135p' app/admin/cases/ReportHistory.tsx`
Read how cases are pushed into each `hours` bucket. Day and hour KEYS already sort `.reverse()` (newest-first). Confirm whether the cases *within* an hour bucket are ordered.

- [ ] **Step 2: Add a within-hour newest-first sort if absent**

If the per-hour array is rendered in insertion order, sort it newest-first where it's read for render. Locate the `.map` that renders an hour's cases and sort its source array:
```tsx
// within the hour-group render, replace `hourCases.map(...)` source with:
[...hourCases]
  .sort((a, b) =>
    new Date(b.occurred_at || b.created_at).getTime() -
    new Date(a.occurred_at || a.created_at).getTime())
  .map(...)
```
(Use the actual local variable name found in Step 1 for the hour's case array.)

- [ ] **Step 3: Inspect the admin ensemble grid**

Run: `sed -n '1,80p' components/EnsembleAttendanceGrid.tsx`
If it lists submissions/cells in a time order, ensure newest-first; if it's an ensemble×day matrix with no incident time-ordering, no change is needed — note that in the commit body.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cases/ReportHistory.tsx components/EnsembleAttendanceGrid.tsx
git commit -m "feat(cases): newest-first ordering across history + grid"
```

---

## Phase 5 — Verify + ship

### Task 9: Full suite, build, deploy, smoke

**Files:** none (release task).

- [ ] **Step 1: Full unit suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: all green (existing 522+ plus the new tests).

- [ ] **Step 2: Production build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Deploy (Node 24)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only hosting`
Expected: `Deploy complete`. (Push the branch separately: `gh auth switch --user dbiel` then `git push -u origin feat/timeline-ensemble-awareness`.)

- [ ] **Step 4: Smoke test on prod**

Verify on `https://ttuboc-attendance.web.app`:
- Admin → open an active report → **Add to timeline** posts a note (appears in the list; hub badges "updated").
- Active board shows **This hour** + **Carried over** groups, newest at top. Use `?now=HH:MM` to force a carried-over case into a prior hour.
- A real `/e/<token>?now=<rehearsal>` with an absent kid who has an active incident shows the **Needs attention** pin; tapping opens the layer; **Send update** posts and appears in the admin timeline (blue "staff link"); office-side note flashes "↻ updated" on the layer.
- Bad token: `/api/e/<bad>/incident/0` → **404**; `/api/e/<bad>/incident/0/update` (POST) → **410**.

- [ ] **Step 5: Update STATUS.md**

Add a dated session block at the top of `STATUS.md` summarizing the four shipped features, the new routes (`/api/e/[token]/incident/[ref]` + `/update`), the no-dorm ensemble incident projection, and the display-only hourly grouping (no cron, no schema/index change). Commit:
```bash
git add STATUS.md
git commit -m "docs: STATUS — timeline edits, ensemble awareness, hourly archive, newest-first"
```

---

## Self-review notes

- **Spec coverage:** Phase 1 → Task 1. Phase 2 → Tasks 2–5 (projection, lib, routes, UI). Phase 3 → Tasks 6–7. Phase 4 → Tasks 6 (sort) + 7 (active board) + 8 (history/grid). Verify/ship → Task 9. All spec sections mapped.
- **Privacy:** Task 2's projection omits dorm + asserts it via a negative `JSON.stringify` match; routes return uniform 404/410; rate limits mirror `/r`.
- **Type consistency:** `EnsembleIncidentProjection` (Task 2) is consumed by Task 3's return types and Task 5's `Incident` shape (structurally identical fields). `partitionActiveByHour` signature identical across Tasks 6–7. `incident_refs` added to the route (Task 4) and the page `LoadData` (Task 5).
- **No cron / no schema change:** Phase 3 is pure display (`partitionActiveByHour`), consistent with the spec non-goals.
