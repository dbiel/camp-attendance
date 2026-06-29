# Office-Marked (Excused) Absences — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin mark a student absent for a clock window so it surfaces on the ensemble manager's `/e` roster (auto-Absent + note), suppresses the incident, and clears quietly on arrival.

**Architecture:** A new `marked_absences` collection with a small lib (`lib/marked-absences.ts`) whose covering-now logic is pure + unit-tested. Admin CRUD routes drive a "Mark absent" form (reusing an extracted `StudentPicker`). The public `/e` GET returns a ref-keyed `marked_absent` map; the page defaults those rows to Absent and shows a note. Suppression + arrival-clear live inside `submitEnsembleAttendance` (it already re-derives the roster server-side). No cron, no `cases` schema change.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (Admin SDK), Vitest, Tailwind `--var` semantic classes.

## Global Constraints

- **Node 24 only.** `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` before `npm test`/build/deploy.
- **`marked_absences` is Admin-SDK-only** (Firestore rules `read: if false`). Public `/e` exposes only a **ref-keyed** `{ note, until }` map — never `student_id`, never the full record. `ref` is the opaque id-sorted-roster index (same scheme as `incident_refs`).
- **Covering-now** = `status==='active'` AND `date===today` AND `from <= now < until`, all camp-tz, honoring `?now=HH:MM`. `until` is **exclusive**. Expiry after `until` is computed (no cron, no cleanup job).
- **Suppression is bounded:** only a student with an active office-absence covering now skips incident creation; everyone else files incidents exactly as today.
- **Arrival is quiet:** a Present mark on an office-absent student clears the record (`cleared_reason: 'arrived'`) — no event, no case, no admin alert.
- **No `cases` schema/index change.** `marked_absences` queries use only equality filters (`date==`, `status==`) — no composite index.
- **Admin routes** use `withAuth('lookup_admin', …)`; the caller email comes from `verifyAdmin(request)`.
- TDD + frequent commits. Vitest unit tests under `tests/unit/{lib,api,app}/`.

---

## Task 1: `lib/marked-absences.ts` — data layer (pure covering-now logic + I/O)

**Files:**
- Create: `lib/marked-absences.ts`
- Test: `tests/unit/lib/marked-absences.test.ts`

**Interfaces:**
- Produces:
  - `interface MarkedAbsence { id, student_id, student_name, date, from, until, note: string|null, status: 'active'|'cleared', cleared_at: string|null, cleared_reason: 'arrived'|'manual'|null, created_by, created_at }`
  - `interface CreateMarkedAbsenceInput { student_id, student_name, from, until, note?: string|null, date?: string, created_by }`
  - `validateWindow(from: string, until: string): boolean` — pure.
  - `isCovering(a: Pick<MarkedAbsence,'status'|'date'|'from'|'until'>, nowHHMM: string, date: string): boolean` — pure.
  - `filterCoveringForStudents(absences: MarkedAbsence[], studentIds: string[], nowHHMM: string, date: string): Map<string, MarkedAbsence>` — pure.
  - `createMarkedAbsence(input): Promise<string>`; `listMarkedAbsences(date): Promise<MarkedAbsence[]>`; `activeMarkedAbsencesForStudents(studentIds, nowHHMM, date): Promise<Map<string, MarkedAbsence>>`; `clearMarkedAbsence(id, reason: 'arrived'|'manual'): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/lib/marked-absences.test.ts
import { describe, it, expect } from 'vitest';
import { validateWindow, isCovering, filterCoveringForStudents } from '@/lib/marked-absences';

const a = (over: Partial<{ status: string; date: string; from: string; until: string; student_id: string; id: string }>) => ({
  id: over.id ?? 'x', student_id: over.student_id ?? 's1', student_name: 'Jane Doe',
  date: over.date ?? '2026-06-29', from: over.from ?? '13:00', until: over.until ?? '14:30',
  note: null, status: (over.status ?? 'active') as 'active' | 'cleared',
  cleared_at: null, cleared_reason: null, created_by: 'd', created_at: 'iso',
});

describe('validateWindow', () => {
  it('accepts a valid HH:MM window with from < until', () => {
    expect(validateWindow('13:00', '14:30')).toBe(true);
  });
  it('rejects from >= until and bad formats', () => {
    expect(validateWindow('14:30', '13:00')).toBe(false);
    expect(validateWindow('13:00', '13:00')).toBe(false);
    expect(validateWindow('1300', '14:30')).toBe(false);
    expect(validateWindow('', '14:30')).toBe(false);
  });
});

describe('isCovering', () => {
  const date = '2026-06-29';
  it('true inside the window', () => expect(isCovering(a({}), '13:30', date)).toBe(true));
  it('true exactly at from (inclusive)', () => expect(isCovering(a({}), '13:00', date)).toBe(true));
  it('false exactly at until (exclusive)', () => expect(isCovering(a({}), '14:30', date)).toBe(false));
  it('false before from', () => expect(isCovering(a({}), '12:59', date)).toBe(false));
  it('false on a different date', () => expect(isCovering(a({}), '13:30', '2026-06-30')).toBe(false));
  it('false when cleared', () => expect(isCovering(a({ status: 'cleared' }), '13:30', date)).toBe(false));
});

describe('filterCoveringForStudents', () => {
  it('keeps only roster students whose absence covers now', () => {
    const list = [a({ id: 'm1', student_id: 's1' }), a({ id: 'm2', student_id: 's2', from: '09:00', until: '10:00' }), a({ id: 'm3', student_id: 'other' })];
    const map = filterCoveringForStudents(list, ['s1', 's2'], '13:30', '2026-06-29');
    expect([...map.keys()]).toEqual(['s1']); // s2 not covering now, other not in roster
    expect(map.get('s1')?.id).toBe('m1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/marked-absences.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/marked-absences.ts
import { adminDb } from './firebase-admin';
import { getTodayDate } from './date';

export interface MarkedAbsence {
  id: string;
  student_id: string;
  student_name: string;
  date: string;          // 'YYYY-MM-DD' camp-tz
  from: string;          // 'HH:MM' inclusive
  until: string;         // 'HH:MM' exclusive
  note: string | null;
  status: 'active' | 'cleared';
  cleared_at: string | null;
  cleared_reason: 'arrived' | 'manual' | null;
  created_by: string;
  created_at: string;
}

const COLL = 'marked_absences';
const HHMM = /^\d{1,2}:\d{2}$/;

/** Pure: a valid HH:MM window with from strictly before until. */
export function validateWindow(from: string, until: string): boolean {
  return HHMM.test(from) && HHMM.test(until) && from < until;
}

/** Pure: does this absence cover `nowHHMM` on `date`? until is exclusive. */
export function isCovering(
  a: Pick<MarkedAbsence, 'status' | 'date' | 'from' | 'until'>,
  nowHHMM: string,
  date: string
): boolean {
  return a.status === 'active' && a.date === date && a.from <= nowHHMM && nowHHMM < a.until;
}

/** Pure: roster students whose absence covers now, keyed by student_id. */
export function filterCoveringForStudents(
  absences: MarkedAbsence[],
  studentIds: string[],
  nowHHMM: string,
  date: string
): Map<string, MarkedAbsence> {
  const ids = new Set(studentIds);
  const out = new Map<string, MarkedAbsence>();
  for (const a of absences) {
    if (ids.has(a.student_id) && isCovering(a, nowHHMM, date)) out.set(a.student_id, a);
  }
  return out;
}

export interface CreateMarkedAbsenceInput {
  student_id: string;
  student_name: string;
  from: string;
  until: string;
  note?: string | null;
  date?: string;
  created_by: string;
}

export async function createMarkedAbsence(input: CreateMarkedAbsenceInput): Promise<string> {
  if (!input.student_id) throw new Error('no_student');
  if (!validateWindow(input.from, input.until)) throw new Error('bad_window');
  const now = new Date().toISOString();
  const doc: Omit<MarkedAbsence, 'id'> = {
    student_id: input.student_id,
    student_name: input.student_name,
    date: input.date ?? getTodayDate(),
    from: input.from,
    until: input.until,
    note: input.note && input.note.trim() ? input.note.trim() : null,
    status: 'active',
    cleared_at: null,
    cleared_reason: null,
    created_by: input.created_by,
    created_at: now,
  };
  const ref = await adminDb.collection(COLL).add(doc);
  return ref.id;
}

/** Active absences for a camp-tz day, soonest-first. Two equality filters only
 * (no composite index). */
export async function listMarkedAbsences(date: string): Promise<MarkedAbsence[]> {
  const snap = await adminDb
    .collection(COLL)
    .where('date', '==', date)
    .where('status', '==', 'active')
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MarkedAbsence, 'id'>) }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Roster students with an active absence covering now (student_id → absence). */
export async function activeMarkedAbsencesForStudents(
  studentIds: string[],
  nowHHMM: string,
  date: string
): Promise<Map<string, MarkedAbsence>> {
  if (studentIds.length === 0) return new Map();
  const all = await listMarkedAbsences(date);
  return filterCoveringForStudents(all, studentIds, nowHHMM, date);
}

export async function clearMarkedAbsence(id: string, reason: 'arrived' | 'manual'): Promise<void> {
  await adminDb.collection(COLL).doc(id).update({
    status: 'cleared',
    cleared_at: new Date().toISOString(),
    cleared_reason: reason,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/marked-absences.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/marked-absences.ts tests/unit/lib/marked-absences.test.ts
git commit -m "feat(absences): marked_absences data layer + covering-now logic"
```

---

## Task 2: Admin CRUD routes

**Files:**
- Create: `app/api/marked-absences/route.ts` (POST + GET)
- Create: `app/api/marked-absences/[id]/route.ts` (DELETE)
- Test: `tests/unit/api/marked-absences.test.ts`

**Interfaces:**
- Consumes: Task 1 (`createMarkedAbsence`, `listMarkedAbsences`, `clearMarkedAbsence`, `validateWindow`); `withAuth` (`@/lib/with-auth`), `verifyAdmin` (`@/lib/auth`), `getTodayDate` (`@/lib/date`).
- Produces: `POST /api/marked-absences {student_id, student_name, from, until, note?}` → `{id}` / 400; `GET /api/marked-absences?date=` → `{absences}`; `DELETE /api/marked-absences/<id>` → `{ok:true}`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/api/marked-absences.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ created: 'm1', list: [] as unknown[], cleared: [] as string[] }));

vi.mock('@/lib/with-auth', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}));
vi.mock('@/lib/auth', () => ({ verifyAdmin: async () => ({ email: 'd@x' }) }));
vi.mock('@/lib/date', () => ({ getTodayDate: () => '2026-06-29' }));
vi.mock('@/lib/marked-absences', () => ({
  validateWindow: (f: string, u: string) => /^\d{1,2}:\d{2}$/.test(f) && /^\d{1,2}:\d{2}$/.test(u) && f < u,
  createMarkedAbsence: async () => h.created,
  listMarkedAbsences: async () => h.list,
  clearMarkedAbsence: async (id: string) => { h.cleared.push(id); },
}));

import { POST, GET } from '@/app/api/marked-absences/route';
import { DELETE } from '@/app/api/marked-absences/[id]/route';

const req = (body?: unknown, url = 'http://x/api/marked-absences') =>
  new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }) as any;

beforeEach(() => { h.list = []; h.cleared = []; });

describe('POST /api/marked-absences', () => {
  it('creates and returns the id', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe('m1');
  });
  it('400 on a bad window', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', from: '14:30', until: '13:00' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
  it('400 on a missing student', async () => {
    const res = await POST(req({ student_name: 'Jane', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/marked-absences', () => {
  it('returns today’s absences', async () => {
    h.list = [{ id: 'm1' }];
    const res = await GET(req(undefined, 'http://x/api/marked-absences'), { params: {} } as any);
    expect((await res.json()).absences).toEqual([{ id: 'm1' }]);
  });
});

describe('DELETE /api/marked-absences/[id]', () => {
  it('clears the absence', async () => {
    const res = await DELETE(req(undefined) as any, { params: { id: 'm9' } } as any);
    expect(res.status).toBe(200);
    expect(h.cleared).toEqual(['m9']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/marked-absences.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement the POST + GET route**

```ts
// app/api/marked-absences/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { verifyAdmin } from '@/lib/auth';
import { getTodayDate } from '@/lib/date';
import { createMarkedAbsence, listMarkedAbsences, validateWindow } from '@/lib/marked-absences';

export const dynamic = 'force-dynamic';

export const POST = withAuth('lookup_admin', async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const { student_id, student_name, from, until, note } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof student_id !== 'string' || !student_id ||
    typeof student_name !== 'string' || !student_name ||
    typeof from !== 'string' || typeof until !== 'string' || !validateWindow(from, until)
  ) {
    return NextResponse.json({ error: 'student and a valid from < until window are required' }, { status: 400 });
  }
  const caller = await verifyAdmin(request);
  const id = await createMarkedAbsence({
    student_id,
    student_name,
    from,
    until,
    note: typeof note === 'string' ? note : null,
    created_by: caller?.email || 'unknown',
  });
  return NextResponse.json({ id });
});

export const GET = withAuth('lookup_admin', async (request: NextRequest) => {
  const date = request.nextUrl.searchParams.get('date') || getTodayDate();
  const absences = await listMarkedAbsences(date);
  return NextResponse.json({ absences });
});
```

- [ ] **Step 4: Implement the DELETE route**

```ts
// app/api/marked-absences/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { clearMarkedAbsence } from '@/lib/marked-absences';

export const dynamic = 'force-dynamic';

export const DELETE = withAuth<{ id: string }>('lookup_admin', async (_request, { params }) => {
  await clearMarkedAbsence(params.id, 'manual');
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/api/marked-absences.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/marked-absences tests/unit/api/marked-absences.test.ts
git commit -m "feat(absences): admin create/list/clear routes"
```

---

## Task 3: Extract `StudentPicker` into a shared component

**Files:**
- Create: `app/admin/cases/StudentPicker.tsx`
- Modify: `app/admin/cases/NewReport.tsx` (remove the local `StudentPicker` + `Candidate`, import from the new file)
- Test: none new — verified by the full suite + typecheck (pure move).

**Interfaces:**
- Produces: `export interface Candidate { id: string; name: string; ensemble: string | null; dorm_building?: string; instrument: string }` and `export function StudentPicker({ candidates, value, selected, onChange, getAuthHeaders }: { candidates: Candidate[]; value: string; selected: Candidate | null; onChange: (cand: Candidate) => void; getAuthHeaders: () => Promise<Record<string, string>> }): JSX.Element`.

- [ ] **Step 1: Create the shared file**

Move the existing `Candidate` interface (currently `app/admin/cases/NewReport.tsx:6`) and the `StudentPicker` function (currently `app/admin/cases/NewReport.tsx:392`) verbatim into a new client component file, exporting both. Add `'use client';` at the top.

```tsx
// app/admin/cases/StudentPicker.tsx
'use client';

import { useState } from 'react';

export interface Candidate {
  id: string;
  name: string;
  ensemble: string | null;
  dorm_building?: string;
  instrument: string;
}

export function StudentPicker({ candidates, value, selected, onChange, getAuthHeaders }: {
  candidates: Candidate[];
  value: string;
  selected: Candidate | null;
  onChange: (cand: Candidate) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  // ... move the EXACT body currently in NewReport.tsx's StudentPicker (search,
  // results, pinned selection, options list) here unchanged ...
}
```

(Copy the full function body exactly as it exists in `NewReport.tsx` — do not rewrite it.)

- [ ] **Step 2: Update `NewReport.tsx`**

- Remove the local `interface Candidate { … }` and the local `function StudentPicker(…) { … }`.
- Add at the top with the other imports: `import { StudentPicker, type Candidate } from './StudentPicker';`
- Leave every other use of `Candidate`/`StudentPicker` in `NewReport.tsx` unchanged (the JSX usage at the report form stays identical).

- [ ] **Step 3: Typecheck + full suite (no behavior change)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: no type errors; full suite green (same count as before this task).

- [ ] **Step 4: Commit**

```bash
git add app/admin/cases/StudentPicker.tsx app/admin/cases/NewReport.tsx
git commit -m "refactor(cases): extract StudentPicker into a shared component"
```

---

## Task 4: `MarkAbsent` form + wire into the Incident page

**Files:**
- Create: `app/admin/cases/MarkAbsent.tsx`
- Modify: `app/admin/cases/page.tsx` (button + mount the component)
- Test: `tests/unit/app/mark-absent.test.tsx`

**Interfaces:**
- Consumes: Task 2 routes; Task 3 `StudentPicker`/`Candidate`; `useAuth` (`@/lib/auth-context`).
- Produces: `export function MarkAbsent({ getAuthHeaders }: { getAuthHeaders: () => Promise<Record<string, string>> }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/app/mark-absent.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkAbsent } from '@/app/admin/cases/MarkAbsent';

const getAuthHeaders = async () => ({});

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/api/marked-absences') && (!opts || opts.method === 'GET' || opts.method === undefined)) {
      return { ok: true, json: async () => ({ absences: [{ id: 'm1', student_name: 'Jane Doe', from: '13:00', until: '14:30', note: 'doctor appt' }] }) } as any;
    }
    return { ok: true, json: async () => ({ id: 'new1' }) } as any; // POST/DELETE
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('MarkAbsent', () => {
  it('lists today’s marked absences', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => expect(screen.getByText(/Jane Doe/)).toBeInTheDocument());
    expect(screen.getByText(/13:00/)).toBeInTheDocument();
  });

  it('submits a new absence (POST to /api/marked-absences)', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => screen.getByText(/Jane Doe/));
    // pick a student via the search box result
    fireEvent.change(screen.getByPlaceholderText(/search roster/i), { target: { value: 'Sam' } });
    // (student-search results are mocked by the same fetch returning {absences}; the
    // component should still allow setting from/until and posting once a student is chosen)
    // Simulate selection by calling the From/Until inputs + Save with a stubbed selection:
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText(/until/i), { target: { value: '16:00' } });
    // Save is disabled until a student is chosen; this assertion checks the POST path
    // fires once a student is selected — the component exposes a test-friendly state via
    // the StudentPicker onChange. Keeping this test focused on the list + POST wiring:
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/marked-absences'),
      expect.objectContaining({})
    );
  });
});
```

NOTE for the implementer: keep the second test focused and deterministic — if wiring a full `StudentPicker` selection in jsdom is awkward, assert the **list render + the Save-disabled-until-student-selected** behavior and the POST call shape instead. Do not assert against `StudentPicker` internals. The first test (list render) is the required one; make the second verify whatever selection path the component actually exposes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/mark-absent.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// app/admin/cases/MarkAbsent.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentPicker, type Candidate } from './StudentPicker';

interface Absence {
  id: string;
  student_name: string;
  from: string;
  until: string;
  note: string | null;
}

/** Office "mark a kid absent" control: a student + a clock window → POST; plus a
 * compact list of today's active office-absences with Clear. */
export function MarkAbsent({ getAuthHeaders }: { getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/marked-absences', { headers });
      if (res.ok) setAbsences(((await res.json()).absences as Absence[]) ?? []);
    } catch {
      /* transient */
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function save() {
    if (!selected || !from || !until) return;
    if (from >= until) { setError('"Until" must be after "From".'); return; }
    setBusy(true);
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/marked-absences', {
        method: 'POST',
        headers,
        body: JSON.stringify({ student_id: selected.id, student_name: selected.name, from, until, note: note.trim() || null }),
      });
      if (!res.ok) { setError('Could not save. Please try again.'); return; }
      setSelected(null); setFrom(''); setUntil(''); setNote('');
      await load();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function clear(id: string) {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/marked-absences/${id}`, { method: 'DELETE', headers });
      await load();
    } catch {
      /* transient */
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="camp-btn-outline px-3 py-1.5 text-sm">
        Mark absent
      </button>
    );
  }

  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Mark a student absent (office)</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-[var(--text-3)]">Close</button>
      </div>

      <div className="mt-2">
        <StudentPicker
          candidates={[]}
          value={selected?.id ?? ''}
          selected={selected}
          onChange={setSelected}
          getAuthHeaders={getAuthHeaders}
        />
      </div>

      <div className="mt-2 flex gap-3">
        <label className="text-sm">From
          <input type="time" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
        </label>
        <label className="text-sm">Until
          <input type="time" aria-label="Until" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason (optional) — e.g. doctor appt"
        className="mt-2 w-full rounded border p-2 text-sm"
      />
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      <button
        onClick={save}
        disabled={busy || !selected || !from || !until}
        className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save absence'}
      </button>

      <div className="mt-3 border-t border-[var(--glass-border)] pt-2">
        <h3 className="text-sm font-semibold text-[var(--text-2)]">Marked absent (today)</h3>
        {absences.length === 0 && <p className="text-sm text-[var(--text-3)]">None.</p>}
        <ul className="mt-1 flex flex-col gap-1">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded border border-[var(--glass-border)] px-2 py-1 text-sm">
              <span>{a.student_name} · out {a.from}–{a.until}{a.note ? ` · ${a.note}` : ''}</span>
              <button onClick={() => clear(a.id)} className="text-xs text-red-700 underline">Clear</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire into `app/admin/cases/page.tsx`**

Add the import:
```tsx
import { MarkAbsent } from './MarkAbsent';
```
In the header row (currently the `<header>` with the `<h1>Active Reports</h1>` + "+ New report" button), render `<MarkAbsent getAuthHeaders={getAuthHeaders} />` next to the "+ New report" button (e.g. wrap the two buttons in a `flex gap-2`). The `getAuthHeaders` comes from the existing `useAuth()` already destructured in the page.

- [ ] **Step 5: Run tests + typecheck + full suite**

Run: `npx vitest run tests/unit/app/mark-absent.test.tsx && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: PASS; full suite green.

- [ ] **Step 6: Commit**

```bash
git add app/admin/cases/MarkAbsent.tsx app/admin/cases/page.tsx tests/unit/app/mark-absent.test.tsx
git commit -m "feat(absences): admin Mark-absent form + today's list"
```

---

## Task 5: Surface office-absences on the `/e` roster

**Files:**
- Modify: `app/api/e/[token]/route.ts` (add `marked_absent` map)
- Modify: `app/e/[token]/page.tsx` (default marked refs to Absent + show the note)
- Test: `tests/unit/api/ensemble-marked-absent.test.ts`

**Interfaces:**
- Consumes: `activeMarkedAbsencesForStudents` (Task 1); `getRosterForToken` already used by the GET via `getCurrentEnsembleSession`/`getRosterForToken`; `getTodayDate`, `getCurrentTimeHHMM` (`@/lib/date`).
- Produces: `GET /api/e/[token]` response gains `marked_absent: Record<number, { note: string; until: string }>` (ref-keyed). `LoadData` in the page gains the same field.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/api/ensemble-marked-absent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  ctx: { status: 'rehearsal', forced: false, period_number: 6, period_name: 'Period 6', start_time: '13:00', end_time: '14:00', location: 'Hemmle', next: null, ensemble: 'Band 5', label: null, slot_key: 'P6' },
  roster: [{ id: 's1', preferred_name: '', first_name: 'Jane', last_name: 'Doe', instrument: 'Flute', grade: '9' }, { id: 's2', preferred_name: '', first_name: 'Sam', last_name: 'Poe', instrument: 'Flute', grade: '9' }],
  marked: new Map<string, any>(),
  rl: true,
}));

vi.mock('@/lib/ensemble-attendance', () => ({
  getCurrentEnsembleSession: async () => h.ctx,
  getRosterForToken: async () => ({ ensemble: 'Band 5', label: null, roster: h.roster }),
  getEnsembleSubmission: async () => null,
}));
vi.mock('@/lib/ensemble-incidents', () => ({ listActiveIncidentRefs: async () => [] }));
vi.mock('@/lib/marked-absences', () => ({ activeMarkedAbsencesForStudents: async () => h.marked }));
vi.mock('@/lib/date', () => ({ getTodayDate: () => '2026-06-29', getCurrentTimeHHMM: () => '13:30' }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => h.rl, getClientIp: () => '1.2.3.4' }));

import { GET } from '@/app/api/e/[token]/route';

const req = (url = 'http://x/api/e/t') => new Request(url) as any;

beforeEach(() => { h.marked = new Map(); h.rl = true; });

describe('GET /api/e/[token] marked_absent', () => {
  it('returns a ref-keyed marked_absent map (no student_id)', async () => {
    h.marked = new Map([['s1', { id: 'm1', note: 'doctor appt', until: '14:30', from: '13:00', status: 'active', date: '2026-06-29', student_id: 's1', student_name: 'Jane Doe' }]]);
    const res = await GET(req(), { params: { token: 't' } });
    const body = await res.json();
    expect(body.marked_absent).toEqual({ 0: { note: 'doctor appt', until: '14:30' } });
    expect(JSON.stringify(body.marked_absent)).not.toContain('s1');
  });
  it('omits students with no covering absence', async () => {
    const res = await GET(req(), { params: { token: 't' } });
    expect((await res.json()).marked_absent).toEqual({});
  });
});
```

NOTE: confirm the exact existing mock surface of `app/api/e/[token]/route.ts` (it imports `getCurrentEnsembleSession`, `getRosterForToken`, `getEnsembleSubmission` from `@/lib/ensemble-attendance`, `toEnsembleRosterProjection` from `@/lib/projections`, `getTodayDate` from `@/lib/date`). Mirror the existing imports; add the `toEnsembleRosterProjection` mock if the real one isn't import-safe under test (it is pure — you may import it for real). Adjust the test's mocks to match the real import list.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/ensemble-marked-absent.test.ts`
Expected: FAIL (no `marked_absent` in the response yet).

- [ ] **Step 3: Implement the GET change**

In `app/api/e/[token]/route.ts`:
- Add imports:
```ts
import { activeMarkedAbsencesForStudents } from '@/lib/marked-absences';
import { getCurrentTimeHHMM } from '@/lib/date'; // alongside the existing getTodayDate import
```
- After the roster + `incident_refs` are built, compute the ref-keyed map (reuse `rosterData.roster` and the same `?now=` override the GET already reads as `nowHHMM`):
```ts
  const nowForAbsence = nowHHMM ?? getCurrentTimeHHMM();
  const markedMap = await activeMarkedAbsencesForStudents(
    rosterData.roster.map((s) => s.id),
    nowForAbsence,
    getTodayDate()
  );
  const marked_absent: Record<number, { note: string; until: string }> = {};
  rosterData.roster.forEach((s, i) => {
    const a = markedMap.get(s.id);
    if (a) marked_absent[i] = { note: a.note || 'Marked absent by office', until: a.until };
  });
```
- Add `marked_absent,` to the returned JSON object (alongside `incident_refs`).

(`nowHHMM` is the validated `?now=` value the GET already parses; if the local variable has a different name in the file, use that one.)

- [ ] **Step 4: Wire the page (`app/e/[token]/page.tsx`)**

- Extend `LoadData` with: `marked_absent: Record<number, { note: string; until: string }>;`
- In the `load()` mark-initialization (where it does `for (const r of data.roster) init[r.ref] = 'present';` then overlays the submission), insert BEFORE the submission overlay:
```tsx
      // Office-marked absences default the row to Absent (a saved submission still wins).
      for (const refStr of Object.keys(data.marked_absent ?? {})) init[Number(refStr)] = 'absent';
```
- In `renderRow`, show the note when present (inside the name block, after the instrument/grade line):
```tsx
          {data.marked_absent?.[r.ref] && (
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              Office: out until {data.marked_absent[r.ref].until}
              {data.marked_absent[r.ref].note ? ` — ${data.marked_absent[r.ref].note}` : ''}
            </p>
          )}
```
(`renderRow` is defined after `const { data } = state;`, so `data` is in scope. If `renderRow` is a top-level closure that already reads `data`, no extra wiring is needed.)

- [ ] **Step 5: Run tests + typecheck + full suite**

Run: `npx vitest run tests/unit/api/ensemble-marked-absent.test.ts && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: PASS; full suite green.

- [ ] **Step 6: Commit**

```bash
git add "app/api/e/[token]/route.ts" "app/e/[token]/page.tsx" tests/unit/api/ensemble-marked-absent.test.ts
git commit -m "feat(absences): surface office-absences on the /e roster (auto-absent + note)"
```

---

## Task 6: Suppress the incident + clear on arrival in submit

**Files:**
- Modify: `lib/ensemble-attendance.ts` (`submitEnsembleAttendance` — case-creation guard + arrival clear)
- Test: `tests/unit/lib/ensemble-attendance.test.ts` (append cases)

**Interfaces:**
- Consumes: `activeMarkedAbsencesForStudents`, `clearMarkedAbsence` (Task 1).
- Produces: no signature change to `submitEnsembleAttendance`; behavior — an absent student covered by an active office-absence files **no** case; a present office-absent student gets `clearMarkedAbsence(id, 'arrived')`.

- [ ] **Step 1: Write the failing test** (append to `tests/unit/lib/ensemble-attendance.test.ts`)

Add the mock for the new lib near the other `vi.mock`s at the top of the file:
```ts
// (add to the hoisted `h` object) markedMap: new Map<string, any>(), cleared: [] as string[],
```
```ts
vi.mock('@/lib/marked-absences', () => ({
  activeMarkedAbsencesForStudents: async () => h.markedMap,
  clearMarkedAbsence: async (id: string) => { h.cleared.push(id); },
}));
```
Add to `beforeEach`: `h.markedMap = new Map(); h.cleared = [];`

Then append these tests inside the `describe('submitEnsembleAttendance', …)` block:
```ts
  it('office-absent kid marked absent → NO incident filed', async () => {
    h.markedMap = new Map([['a', { id: 'm1', status: 'active', date: '2026-06-28', from: '00:00', until: '23:59', student_id: 'a' }]]);
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent', 1: 'absent' } });
    expect(res.ok).toBe(true);
    // only student b (not office-marked) files a case
    expect(h.buildCaseDoc).toHaveBeenCalledTimes(1);
    expect(h.buildCaseDoc.mock.calls[0][0]).toMatchObject({ student_id: 'b' });
  });

  it('office-absent kid marked PRESENT (arrived) → absence cleared, no case', async () => {
    h.markedMap = new Map([['a', { id: 'm1', status: 'active', date: '2026-06-28', from: '00:00', until: '23:59', student_id: 'a' }]]);
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'present' } });
    expect(res.ok).toBe(true);
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
    expect(h.cleared).toEqual(['m1']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/ensemble-attendance.test.ts`
Expected: FAIL — office-absent kid still files a case / nothing cleared.

- [ ] **Step 3: Implement**

In `lib/ensemble-attendance.ts`:
- Add imports at the top:
```ts
import { activeMarkedAbsencesForStudents, clearMarkedAbsence } from './marked-absences';
```
- Inside `submitEnsembleAttendance`, AFTER `nextMarks`/`studentById` are built and BEFORE `runTransaction`, resolve the office-absence set (camp-tz now = `nowHHMM`, already computed in the function as `nowHHMM`; `day` is the local day var):
```ts
  const officeAbsent = await activeMarkedAbsencesForStudents(Object.keys(nextMarks), nowHHMM, day);
```
- In the transaction's absent branch, add the office-absent guard so a covered kid files no case:
```ts
      if (mark === 'absent' && !hasCase && !officeAbsent.has(studentId)) {
```
- AFTER the transaction returns (outside the closure — re-run-safe), clear the absences for any office-absent kid marked present:
```ts
  for (const [studentId, mark] of Object.entries(nextMarks)) {
    if (mark === 'present' && officeAbsent.has(studentId)) {
      await clearMarkedAbsence(officeAbsent.get(studentId)!.id, 'arrived');
    }
  }
```
(Place this after the `const tally = await adminDb.runTransaction(...)` block and before the function's return.)

- [ ] **Step 4: Run tests + typecheck + full suite**

Run: `npx vitest run tests/unit/lib/ensemble-attendance.test.ts && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: PASS (the new 2 + all existing); full suite green.

- [ ] **Step 5: Commit**

```bash
git add lib/ensemble-attendance.ts tests/unit/lib/ensemble-attendance.test.ts
git commit -m "feat(absences): suppress incident + clear on arrival for office-absences"
```

---

## Task 7: Verify + ship

**Files:** none (release task).

- [ ] **Step 1: Full unit suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: all green (existing 566 + the new tests).

- [ ] **Step 2: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; confirm `/api/marked-absences` and `/api/marked-absences/[id]` appear in the route list.

- [ ] **Step 3: Deploy (Node 24)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && FIREBASE_CLI_EXPERIMENTS=webframeworks FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only hosting`
Expected: `Deploy complete`.

- [ ] **Step 4: Prod smoke**

```bash
BASE=https://ttuboc-attendance.web.app
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/marked-absences"            # 401 (admin-gated)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/marked-absences" -H 'Content-Type: application/json' -d '{}'  # 401
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/e/deadbeef"                     # 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/cases"                    # 200
```
Then David verifies interactively (login + a real ensemble token): Mark a kid absent for a window → the `/e` roster shows them auto-Absent with the note → submitting files no incident on the board → marking them Present clears the office-absence.

- [ ] **Step 5: STATUS.md**

Add a dated session block at the top of `STATUS.md` summarizing office-marked absences: the `marked_absences` collection, admin Mark-absent form + routes, `/e` auto-absent + note, submit suppression + quiet arrival-clear, no cron/no `cases` schema change. Commit:
```bash
git add STATUS.md
git commit -m "docs: STATUS — office-marked (excused) absences"
```

---

## Self-review notes

- **Spec coverage:** data model → Task 1; admin routes → Task 2; StudentPicker reuse → Task 3; Mark-absent form + today's list → Task 4; `/e` surfacing (auto-absent + note) → Task 5; suppression + arrival-clear → Task 6; verify/ship → Task 7. All spec sections mapped.
- **Privacy:** `marked_absent` is ref-keyed (`{note, until}` only) — Task 5 test asserts no `student_id` in the payload. `marked_absences` reads are Admin-SDK-only.
- **Type consistency:** `MarkedAbsence`, `CreateMarkedAbsenceInput`, `validateWindow`, `isCovering`, `filterCoveringForStudents`, `activeMarkedAbsencesForStudents(studentIds, nowHHMM, date)`, `clearMarkedAbsence(id, reason)` are defined in Task 1 and consumed unchanged in Tasks 2/5/6. `Candidate`/`StudentPicker` signature identical across Tasks 3/4.
- **No cron / no cases-schema change:** covering-now is computed; suppression/clear reuse the existing submit transaction; `marked_absences` queries are equality-only (no composite index).
