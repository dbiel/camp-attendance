# Mark-absent Date Picker + All-Day Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the office mark a kid absent for a specific date (default today) and optionally all-day; show today + upcoming absences in the admin list; surface "out all day" on the `/e` roster.

**Architecture:** Add an `all_day` flag + `date` plumbing to `marked_absences`. All-day stores `from='00:00'`/`until='23:59'` so the existing date-scoped covering-now check is unchanged — `all_day` drives display only. New pure helpers (`validDate`, `resolveWindow`, `filterUpcoming`) keep logic testable; thin I/O wrappers add the upcoming query. The `/e` GET adds `all_day` to its ref-keyed `marked_absent` map.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (Admin SDK), Vitest, Tailwind `--var` classes.

## Global Constraints

- **Node 24 only.** `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` before tests/build/deploy.
- **GUARDRAILS for implementers:** work ONLY on the current branch; do NOT create/switch branches, create git worktrees, invoke any worktree skill, or create new spec/plan/.md files. Touch only the files each task names.
- **All-day stores `from='00:00'`, `until='23:59'`, `all_day=true`.** Covering-now (`isCovering`) is UNCHANGED — `00:00 <= now < 23:59` covers all camp hours. `all_day` is display-only.
- **`date` is camp-tz `YYYY-MM-DD`, validated server-side:** `validDate` = `/^\d{4}-\d{2}-\d{2}$/` AND `date >= today`. Past dates → 400.
- **No new Firestore composite index.** Upcoming list = `status=='active'` equality query + in-code `date >= today` filter + sort.
- **`marked_absences` stays Admin-SDK-only;** the `/e` `marked_absent` map adds only the boolean `all_day` (no PII). Admin routes stay `withAuth('lookup_admin')`.
- TDD + frequent commits. Vitest under `tests/unit/{lib,api,app}/`.

---

## Task 1: `lib/marked-absences.ts` — all_day, validDate, upcoming

**Files:**
- Modify: `lib/marked-absences.ts`
- Test: `tests/unit/lib/marked-absences.test.ts` (append pure-helper tests)

**Interfaces:**
- Produces:
  - `MarkedAbsence` gains `all_day: boolean`; `CreateMarkedAbsenceInput` gains `all_day?: boolean` and makes `from?`/`until?` optional.
  - `validDate(date: string, today?: string): boolean`
  - `resolveWindow(allDay: boolean, from: string, until: string): { from: string; until: string }`
  - `filterUpcoming(absences: MarkedAbsence[], today: string): MarkedAbsence[]`
  - `listUpcomingMarkedAbsences(): Promise<MarkedAbsence[]>`
  - `createMarkedAbsence` now accepts `all_day` and stores it.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/lib/marked-absences.test.ts`:

```ts
import { validDate, resolveWindow, filterUpcoming } from '@/lib/marked-absences';

describe('validDate', () => {
  it('accepts today and future YYYY-MM-DD', () => {
    expect(validDate('2026-06-29', '2026-06-29')).toBe(true);
    expect(validDate('2026-07-01', '2026-06-29')).toBe(true);
  });
  it('rejects past dates and malformed strings', () => {
    expect(validDate('2026-06-28', '2026-06-29')).toBe(false);
    expect(validDate('6/29/2026', '2026-06-29')).toBe(false);
    expect(validDate('', '2026-06-29')).toBe(false);
  });
});

describe('resolveWindow', () => {
  it('forces 00:00–23:59 for all-day', () => {
    expect(resolveWindow(true, '13:00', '14:00')).toEqual({ from: '00:00', until: '23:59' });
  });
  it('keeps the given window when not all-day', () => {
    expect(resolveWindow(false, '13:00', '14:00')).toEqual({ from: '13:00', until: '14:00' });
  });
});

describe('filterUpcoming', () => {
  const mk = (id: string, date: string, from: string) => ({
    id, student_id: 's', student_name: 'n', date, from, until: '23:59', all_day: false,
    note: null, status: 'active', cleared_at: null, cleared_reason: null, created_by: 'd', created_at: 'iso',
  }) as any;
  it('keeps today+future, drops past, sorts by date then from', () => {
    const list = [mk('c', '2026-07-02', '09:00'), mk('a', '2026-06-29', '13:00'), mk('b', '2026-06-29', '08:00'), mk('p', '2026-06-28', '09:00')];
    const out = filterUpcoming(list, '2026-06-29');
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/lib/marked-absences.test.ts`
Expected: FAIL — `validDate`/`resolveWindow`/`filterUpcoming` not exported.

- [ ] **Step 3: Implement** in `lib/marked-absences.ts`:

Add `all_day: boolean;` to the `MarkedAbsence` interface (after `until`):
```ts
  all_day: boolean;      // true → whole-day; from/until are '00:00'/'23:59'
```

Add the pure helpers (after `validateWindow`):
```ts
/** Pure: a valid camp-tz YYYY-MM-DD that is today or later. */
export function validDate(date: string, today: string = getTodayDate()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today;
}

/** Pure: the stored window. All-day collapses to the whole camp day. */
export function resolveWindow(allDay: boolean, from: string, until: string): { from: string; until: string } {
  return allDay ? { from: '00:00', until: '23:59' } : { from, until };
}

/** Pure: today + future active absences, sorted by date then start time. */
export function filterUpcoming(absences: MarkedAbsence[], today: string): MarkedAbsence[] {
  return absences
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.from.localeCompare(b.from));
}
```

Replace `CreateMarkedAbsenceInput` so the window is optional and `all_day` is accepted:
```ts
export interface CreateMarkedAbsenceInput {
  student_id: string;
  student_name: string;
  from?: string;
  until?: string;
  all_day?: boolean;
  note?: string | null;
  date?: string;
  created_by: string;
}
```

Replace `createMarkedAbsence` with:
```ts
export async function createMarkedAbsence(input: CreateMarkedAbsenceInput): Promise<string> {
  if (!input.student_id) throw new Error('no_student');
  const date = input.date ?? getTodayDate();
  if (!validDate(date)) throw new Error('bad_date');
  const allDay = input.all_day === true;
  if (!allDay && !validateWindow(input.from ?? '', input.until ?? '')) throw new Error('bad_window');
  const { from, until } = resolveWindow(allDay, input.from ?? '', input.until ?? '');
  const now = new Date().toISOString();
  const doc: Omit<MarkedAbsence, 'id'> = {
    student_id: input.student_id,
    student_name: input.student_name,
    date,
    from,
    until,
    all_day: allDay,
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
```

Add the upcoming query (after `listMarkedAbsences`):
```ts
/** Today + future active absences (admin list). Equality-only query + in-code
 * date filter — no composite index. */
export async function listUpcomingMarkedAbsences(): Promise<MarkedAbsence[]> {
  const snap = await adminDb.collection(COLL).where('status', '==', 'active').get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MarkedAbsence, 'id'>) }));
  return filterUpcoming(all, getTodayDate());
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/lib/marked-absences.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean for this lib (the POST route still calls the old shape — that's Task 2; if tsc errors ONLY in `app/api/marked-absences`, proceed).

- [ ] **Step 5: Commit**

```bash
git add lib/marked-absences.ts tests/unit/lib/marked-absences.test.ts
git commit -m "feat(absences): all_day flag, validDate, upcoming list helpers"
```

---

## Task 2: Admin routes — date + all_day on POST, upcoming on GET

**Files:**
- Modify: `app/api/marked-absences/route.ts`
- Test: `tests/unit/api/marked-absences.test.ts`

**Interfaces:**
- Consumes: Task 1 (`createMarkedAbsence`, `listMarkedAbsences`, `listUpcomingMarkedAbsences`, `validateWindow`, `validDate`).

- [ ] **Step 1: Write the failing test** — replace `tests/unit/api/marked-absences.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ created: 'm1', createArgs: null as any, list: [] as unknown[], upcoming: [] as unknown[], cleared: [] as string[] }));

vi.mock('@/lib/with-auth', () => ({ withAuth: (_role: string, handler: Function) => handler }));
vi.mock('@/lib/auth', () => ({ verifyAdmin: async () => ({ email: 'd@x' }) }));
vi.mock('@/lib/date', () => ({ getTodayDate: () => '2026-06-29' }));
vi.mock('@/lib/marked-absences', () => ({
  validateWindow: (f: string, u: string) => /^\d{2}:\d{2}$/.test(f) && /^\d{2}:\d{2}$/.test(u) && f < u,
  validDate: (d: string, today = '2026-06-29') => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today,
  createMarkedAbsence: async (args: any) => { h.createArgs = args; return h.created; },
  listMarkedAbsences: async () => h.list,
  listUpcomingMarkedAbsences: async () => h.upcoming,
  clearMarkedAbsence: async (id: string) => { h.cleared.push(id); },
}));

import { POST, GET } from '@/app/api/marked-absences/route';

const req = (body?: unknown, url = 'http://x/api/marked-absences') =>
  new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }) as any;

beforeEach(() => { h.createArgs = null; h.list = []; h.upcoming = []; h.cleared = []; });

describe('POST /api/marked-absences', () => {
  it('creates a timed absence with a date', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-07-01', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(200);
    expect(h.createArgs).toMatchObject({ date: '2026-07-01', from: '13:00', until: '14:30', all_day: false });
  });
  it('creates an all-day absence WITHOUT a window', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-06-29', all_day: true }), { params: {} } as any);
    expect(res.status).toBe(200);
    expect(h.createArgs).toMatchObject({ all_day: true, date: '2026-06-29' });
  });
  it('400 on a past date', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-06-28', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
  it('400 on a timed absence with a bad window', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-06-29', from: '14:30', until: '13:00' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
  it('400 on a missing student', async () => {
    const res = await POST(req({ student_name: 'Jane', date: '2026-06-29', all_day: true }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/marked-absences', () => {
  it('returns upcoming when no ?date', async () => {
    h.upcoming = [{ id: 'm1' }];
    const res = await GET(req(undefined, 'http://x/api/marked-absences'), { params: {} } as any);
    expect((await res.json()).absences).toEqual([{ id: 'm1' }]);
  });
  it('returns a specific day when ?date is given', async () => {
    h.list = [{ id: 'd1' }];
    const res = await GET(req(undefined, 'http://x/api/marked-absences?date=2026-07-01'), { params: {} } as any);
    expect((await res.json()).absences).toEqual([{ id: 'd1' }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/api/marked-absences.test.ts`
Expected: FAIL — route doesn't handle date/all_day/upcoming yet.

- [ ] **Step 3: Implement** — replace `app/api/marked-absences/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { verifyAdmin } from '@/lib/auth';
import { getTodayDate } from '@/lib/date';
import {
  createMarkedAbsence,
  listMarkedAbsences,
  listUpcomingMarkedAbsences,
  validateWindow,
  validDate,
} from '@/lib/marked-absences';

export const dynamic = 'force-dynamic';

export const POST = withAuth('lookup_admin', async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const { student_id, student_name, from, until, note, date, all_day } = (body ?? {}) as Record<string, unknown>;
  const theDate = typeof date === 'string' && date ? date : getTodayDate();
  const allDay = all_day === true;
  if (
    typeof student_id !== 'string' || !student_id ||
    typeof student_name !== 'string' || !student_name ||
    !validDate(theDate) ||
    (!allDay && (typeof from !== 'string' || typeof until !== 'string' || !validateWindow(from, until)))
  ) {
    return NextResponse.json({ error: 'student, a valid date, and (for a timed absence) a from < until window are required' }, { status: 400 });
  }
  const caller = await verifyAdmin(request);
  const id = await createMarkedAbsence({
    student_id,
    student_name,
    date: theDate,
    all_day: allDay,
    from: typeof from === 'string' ? from : undefined,
    until: typeof until === 'string' ? until : undefined,
    note: typeof note === 'string' ? note : null,
    created_by: caller?.email || 'unknown',
  });
  return NextResponse.json({ id });
});

export const GET = withAuth('lookup_admin', async (request: NextRequest) => {
  const date = new URL(request.url).searchParams.get('date');
  const absences = date ? await listMarkedAbsences(date) : await listUpcomingMarkedAbsences();
  return NextResponse.json({ absences });
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/api/marked-absences.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean for the routes.

- [ ] **Step 5: Commit**

```bash
git add app/api/marked-absences/route.ts tests/unit/api/marked-absences.test.ts
git commit -m "feat(absences): POST accepts date + all_day; GET returns upcoming"
```

---

## Task 3: Mark-absent form — date input, all-day toggle, upcoming list

**Files:**
- Modify: `app/admin/cases/MarkAbsent.tsx`
- Test: `tests/unit/app/mark-absent.test.tsx`

**Interfaces:**
- Consumes: Task 2 routes; `getTodayDate` (`@/lib/date`, client-safe — uses `Intl`).

- [ ] **Step 1: Write the failing test** — replace `tests/unit/app/mark-absent.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkAbsent } from '@/app/admin/cases/MarkAbsent';

const getAuthHeaders = async () => ({});

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/api/marked-absences') && (!opts || opts.method === 'GET' || opts.method === undefined)) {
      return { ok: true, json: async () => ({ absences: [
        { id: 'm1', student_name: 'Jane Doe', date: '2026-06-29', all_day: false, from: '13:00', until: '14:30', note: 'doctor appt' },
        { id: 'm2', student_name: 'Sam Poe', date: '2026-07-01', all_day: true, from: '00:00', until: '23:59', note: null },
      ] }) } as any;
    }
    return { ok: true, json: async () => ({ id: 'new1' }) } as any;
  }) as any;
});
afterEach(() => vi.restoreAllMocks());

describe('MarkAbsent date + all-day', () => {
  it('lists upcoming absences with a date label and "All day"', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => expect(screen.getByText(/Jane Doe/)).toBeInTheDocument());
    expect(screen.getByText(/All day/)).toBeInTheDocument();      // Sam Poe's row
    expect(screen.getByText(/13:00/)).toBeInTheDocument();        // Jane's timed row
  });

  it('all-day toggle hides the From/Until inputs', async () => {
    render(<MarkAbsent getAuthHeaders={getAuthHeaders} />);
    fireEvent.click(screen.getByRole('button', { name: /mark absent/i }));
    await waitFor(() => screen.getByText(/Jane Doe/));
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/all day/i));
    expect(screen.queryByLabelText(/from/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/app/mark-absent.test.tsx`
Expected: FAIL — no date label / "All day" / all-day checkbox yet.

- [ ] **Step 3: Implement** — edit `app/admin/cases/MarkAbsent.tsx`:

1. Add the import: `import { getTodayDate } from '@/lib/date';`
2. Extend the `Absence` interface (add `date` + `all_day`):
```tsx
interface Absence {
  id: string;
  student_name: string;
  date: string;
  all_day: boolean;
  from: string;
  until: string;
  note: string | null;
}
```
3. Add state (with the other `useState`s):
```tsx
  const [date, setDate] = useState(getTodayDate());
  const [allDay, setAllDay] = useState(false);
```
4. Replace `save()`'s guard + body so it honors date/all-day:
```tsx
  async function save() {
    if (!selected || !date) return;
    if (!allDay && (!from || !until)) return;
    if (!allDay && from >= until) { setError('"Until" must be after "From".'); return; }
    setBusy(true);
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/marked-absences', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: selected.id, student_name: selected.name,
          date, all_day: allDay,
          ...(allDay ? {} : { from, until }),
          note: note.trim() || null,
        }),
      });
      if (!res.ok) { setError('Could not save. Please try again.'); return; }
      setSelected(null); setFrom(''); setUntil(''); setNote(''); setAllDay(false); setDate(getTodayDate());
      await load();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }
```
5. In the JSX, add a date input + all-day checkbox ABOVE the From/Until row, and gate the From/Until row on `!allDay`. Replace the existing `<div className="mt-2 flex gap-3"> … From … Until … </div>` block with:
```tsx
      <label className="mt-2 block text-sm">
        Date
        <input type="date" aria-label="Date" value={date} min={getTodayDate()} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day
      </label>
      {!allDay && (
        <div className="mt-2 flex gap-3">
          <label className="text-sm">
            From
            <input type="time" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
          </label>
          <label className="text-sm">
            Until
            <input type="time" aria-label="Until" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 block rounded border p-1.5 text-sm" />
          </label>
        </div>
      )}
```
6. Update the Save button's `disabled`:
```tsx
        disabled={busy || !selected || !date || (!allDay && (!from || !until))}
```
7. Update the list header + each row to show the date label + "All day". Add a `dayLabel` helper at the top of the file (outside the component):
```tsx
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
```
Change the list header from `Marked absent (today)` to `Marked absent`, and the row `<span>`:
```tsx
            <li key={a.id} className="flex items-center justify-between rounded border border-[var(--glass-border)] px-2 py-1 text-sm">
              <span>{dayLabel(a.date, getTodayDate())} · {a.student_name} · {a.all_day ? 'All day' : `out ${a.from}–${a.until}`}{a.note ? ` · ${a.note}` : ''}</span>
              <button onClick={() => clear(a.id)} className="text-xs text-red-700 underline">Clear</button>
            </li>
```

- [ ] **Step 4: Run it + full suite + typecheck**

Run: `npx vitest run tests/unit/app/mark-absent.test.tsx && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: PASS; tsc clean; full suite green.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cases/MarkAbsent.tsx tests/unit/app/mark-absent.test.tsx
git commit -m "feat(absences): form date picker + all-day toggle + upcoming list"
```

---

## Task 4: `/e` roster — surface "out all day"

**Files:**
- Modify: `app/api/e/[token]/route.ts` (`marked_absent` map gains `all_day`)
- Modify: `app/e/[token]/page.tsx` (`LoadData` type + the two display sites)
- Test: `tests/unit/api/ensemble-marked-absent.test.ts` (assert `all_day` in the map)

**Interfaces:**
- Consumes: the covering absence's `all_day`.

- [ ] **Step 1: Update the GET test** — in `tests/unit/api/ensemble-marked-absent.test.ts`, the mocked covering absence (in the `h.marked` map) should include `all_day`, and the assertion should expect it. Change the covering-case test so the marked map value is built with `all_day`:
  - In the test where `h.marked` is set, add `all_day: true` to the absence object.
  - Change the expected `marked_absent` assertion to `{ 0: { note: 'doctor appt', until: '14:30', all_day: true } }`.
  (Keep the `not.toContain('s1')` PII guard.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/api/ensemble-marked-absent.test.ts`
Expected: FAIL — `all_day` not in the map.

- [ ] **Step 3: Implement the GET change** — `app/api/e/[token]/route.ts`:
  - Change the map type + build to include `all_day`:
```ts
  const marked_absent: Record<number, { note: string; until: string; all_day: boolean }> = {};
  rosterData.roster.forEach((s, i) => {
    const a = markedMap.get(s.id);
    if (a) marked_absent[i] = { note: a.note || 'Marked absent by office', until: a.until, all_day: a.all_day };
  });
```
  (Match the existing variable names in the file — `markedMap`, `rosterData.roster`. If the existing forEach differs, edit it minimally to add `all_day`.)

- [ ] **Step 4: Update the page** — `app/e/[token]/page.tsx`:
  - `LoadData.marked_absent` type → `Record<number, { note: string; until: string; all_day: boolean }>`.
  - The inline row note (currently `Office: out until {until}…`): show all-day variant:
```tsx
          {data.marked_absent?.[r.ref] && (
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              {data.marked_absent[r.ref].all_day
                ? 'Office: out all day'
                : `Office: out until ${data.marked_absent[r.ref].until}`}
              {data.marked_absent[r.ref].note ? ` — ${data.marked_absent[r.ref].note}` : ''}
            </p>
          )}
```
  - The "Needs attention" pin row (currently `out until {a.until}…`):
```tsx
                  <span className="ml-2 text-xs text-amber-700">
                    {a.all_day ? 'out all day' : `out until ${a.until}`}{a.note ? ` · ${a.note}` : ''}
                  </span>
```
  (Use the existing local `const a = data.marked_absent[r.ref];` in the pin.)

- [ ] **Step 5: Run it + full suite + typecheck**

Run: `npx vitest run tests/unit/api/ensemble-marked-absent.test.ts && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: PASS; tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add "app/api/e/[token]/route.ts" "app/e/[token]/page.tsx" tests/unit/api/ensemble-marked-absent.test.ts
git commit -m "feat(absences): /e roster shows 'out all day' for all-day office absences"
```

---

## Task 5: Verify + ship

**Files:** none (release task).

- [ ] **Step 1: Full suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: all green.

- [ ] **Step 2: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Deploy (Node 24)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && FIREBASE_CLI_EXPERIMENTS=webframeworks FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only hosting`
Expected: `Deploy complete`.

- [ ] **Step 4: Prod smoke**

```bash
BASE=https://ttuboc-attendance.web.app
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/marked-absences"   # 401 (admin-gated)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/marked-absences" -H 'Content-Type: application/json' -d '{}'  # 401
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/e/deadbeef"            # 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/cases"           # 200
```
Then David verifies interactively: Mark a kid absent for a future date and/or all-day → it shows in the date-labeled "Marked absent" list with Clear; on the picked day (use `?now=`/real) the `/e` roster shows the kid auto-Absent with "out all day" / "out until HH:MM".

- [ ] **Step 5: STATUS.md**

Add a dated session block: date picker + all-day on the Mark-absent form; `all_day` flag (stores 00:00–23:59, covering-now unchanged); admin list now today+upcoming (date-labeled); `/e` shows "out all day". Commit `docs: STATUS — mark-absent date picker + all-day`.

---

## Self-review notes

- **Spec coverage:** data model `all_day` + `validDate` + upcoming → Task 1; POST date/all_day + GET upcoming → Task 2; form date/all-day + upcoming list → Task 3; `/e` "out all day" → Task 4; verify/ship → Task 5. All spec sections mapped.
- **Covering-now unchanged:** all-day stored as `00:00`/`23:59`; `isCovering`/`activeMarkedAbsencesForStudents` untouched.
- **No new index:** upcoming = equality query + in-code `filterUpcoming`.
- **Type consistency:** `all_day` added to `MarkedAbsence` (Task 1), the POST `createMarkedAbsence` arg (Task 2), the `Absence` row + form (Task 3), and the `marked_absent` map in both route and page (Task 4). `validDate`/`resolveWindow`/`filterUpcoming`/`listUpcomingMarkedAbsences` signatures consistent across Tasks 1–2.
- **Privacy:** `/e` map adds only the boolean `all_day`; the test keeps the no-student_id guard.
