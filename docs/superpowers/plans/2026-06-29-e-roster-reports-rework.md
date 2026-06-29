# `/e` Roster Reports Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the `/e` roster, move incidents from the top pin to a per-row "Previous Report" link (today's reports, active + resolved), put the office-excused kids in the "Needs attention" pin, and keep every update channel the manager had.

**Architecture:** Rename + broaden the `lib/ensemble-incidents.ts` helpers from "active incidents" to "today's reports (any status)"; add `resolution_note` to the projection; the `/e` GET returns `report_refs` instead of `incident_refs`; the page reads the pin from the existing `marked_absent` map and the per-row link from `report_refs`. The detail/update routes, the layer's typed update box, and `submitEnsembleAttendance`'s tardy-arrival flow are unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (Admin SDK), Vitest, Tailwind `--var` classes.

## Global Constraints

- **Node 24 only.** `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` before tests/build/deploy.
- **Public payload stays ref-keyed / allowlisted.** `report_refs` = roster indices only; the report projection adds ONLY `resolution_note` (office-authored) to the existing allowlist (first name + last initial, instrument, summary, status, `staff_update` events). No student_id, dorm, medical, contact, or raw text.
- **"Today" = camp-tz date of `occurred_at || created_at` == `getTodayDate()`**, via `hourBucket(iso).slice(0,10)` (reuse `lib/date.ts`; no new tz math). Honors `?now=` where the route already does.
- **No new Firestore index.** Today-filtering is an in-code pass over `listCases('active')` + `listCases('resolved')`.
- **Keep unchanged:** `postEnsembleIncidentUpdate` (targets the active case), the `…/update` route, the layer's typed update box (active-only), and `submitEnsembleAttendance` (tardy-arrival "came back" flow).
- **Route paths unchanged** (`/api/e/[token]/incident/[ref]` + `…/update`); the detail response keeps `{ incident: <projection> }`.
- TDD + frequent commits. Vitest under `tests/unit/{lib,api,app}/`.

---

## Task 1: Add `resolution_note` to the report projection

**Files:**
- Modify: `lib/projections.ts` (`EnsembleIncidentProjection` + `toEnsembleIncidentProjection`)
- Test: `tests/unit/lib/projections.test.ts` (extend the existing `toEnsembleIncidentProjection` block)

**Interfaces:**
- Produces: `EnsembleIncidentProjection` gains `resolution_note: string | null`; `toEnsembleIncidentProjection(c, student, events)` populates it from `c.resolution_note ?? null`.

- [ ] **Step 1: Write the failing test** (append inside the existing `describe('toEnsembleIncidentProjection', …)` in `tests/unit/lib/projections.test.ts`)

```ts
  it('carries resolution_note for a resolved report and stays PII-free', () => {
    const resolved = { summary: 'Absent from Band 5', status: 'resolved', resolution_note: 'found in dorm' } as any;
    const p = toEnsembleIncidentProjection(resolved, student, events);
    expect(p.status).toBe('resolved');
    expect(p.resolution_note).toBe('found in dorm');
    expect(JSON.stringify(p)).not.toMatch(/Wall|214|asthma|555|556/);
  });

  it('resolution_note is null when absent on the case', () => {
    const p = toEnsembleIncidentProjection(c, student, events);
    expect(p.resolution_note).toBeNull();
  });
```
(`student`, `c`, `events` are the fixtures already defined at the top of that describe block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/projections.test.ts`
Expected: FAIL — `resolution_note` undefined / not on the type.

- [ ] **Step 3: Implement** in `lib/projections.ts`

Add the field to the interface (after `status: CaseStatus;`):
```ts
  resolution_note: string | null;
```
And in `toEnsembleIncidentProjection`'s returned object (after `status: c.status,`):
```ts
    resolution_note: c.resolution_note ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/projections.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/projections.ts tests/unit/lib/projections.test.ts
git commit -m "feat(e-reports): add resolution_note to the ensemble report projection"
```

---

## Task 2: `lib/ensemble-incidents.ts` — today's reports (any status)

**Files:**
- Modify: `lib/ensemble-incidents.ts`
- Test: `tests/unit/lib/ensemble-incidents.test.ts` (rewrite the two renamed describe blocks; keep the `postEnsembleIncidentUpdate` block)

**Interfaces:**
- Consumes: `listCases('active'|'resolved')`, `listCasesForStudent`, `listCaseEvents`, `addCaseEvent` (`./cases`); `getRosterForToken` (`./ensemble-attendance`); `getStudent` (`./firestore`); `toEnsembleIncidentProjection` (`./projections`); `getTodayDate`, `hourBucket` (`./date`).
- Produces:
  - `listTodayReportRefs(token: string): Promise<number[] | null>` — roster indices whose student has a case from today (active OR resolved). `null` on bad token.
  - `getEnsembleReportByRef(token: string, ref: number): Promise<EnsembleIncidentProjection | null>` — the most-recent today case (any status) for the student at `ref`.
  - `postEnsembleIncidentUpdate(token, ref, body)` — UNCHANGED (targets the active case).

- [ ] **Step 1: Write the failing test** — replace the file `tests/unit/lib/ensemble-incidents.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  roster: [] as any[],
  ensemble: 'Band 5',
  rosterNull: false,
  active: [] as any[],
  resolved: [] as any[],
  studentCases: {} as Record<string, any[]>,
  events: [] as any[],
  added: [] as any[],
}));

vi.mock('@/lib/ensemble-attendance', () => ({
  getRosterForToken: async () =>
    h.rosterNull ? null : { ensemble: h.ensemble, label: null, roster: h.roster },
}));
vi.mock('@/lib/cases', () => ({
  listCases: async (status: string) => (status === 'resolved' ? h.resolved : h.active),
  listCasesForStudent: async (id: string) => h.studentCases[id] ?? [],
  listCaseEvents: async () => h.events,
  addCaseEvent: async (caseId: string, type: string, body: string, actor: string) => {
    h.added.push({ caseId, type, body, actor });
    return 'evt1';
  },
}));
vi.mock('@/lib/firestore', () => ({ getStudent: async () => null }));
// Deterministic camp-tz: today = 2026-06-29; campDate = the ISO's date part.
vi.mock('@/lib/date', () => ({
  getTodayDate: () => '2026-06-29',
  hourBucket: (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 13)}`,
}));

import {
  listTodayReportRefs,
  getEnsembleReportByRef,
  postEnsembleIncidentUpdate,
} from '@/lib/ensemble-incidents';

const TODAY = '2026-06-29T13:00:00Z';
const YESTERDAY = '2026-06-28T13:00:00Z';

beforeEach(() => {
  h.roster = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  h.ensemble = 'Band 5';
  h.rosterNull = false;
  h.active = [];
  h.resolved = [];
  h.studentCases = {};
  h.events = [];
  h.added = [];
});

describe('listTodayReportRefs', () => {
  it('includes today active AND today resolved, by roster ref', async () => {
    h.active = [{ id: 'a', student_id: 's2', status: 'active', occurred_at: TODAY }];
    h.resolved = [{ id: 'r', student_id: 's1', status: 'resolved', occurred_at: TODAY }];
    expect(await listTodayReportRefs('tok')).toEqual([0, 1]);
  });
  it('excludes a report from a previous day', async () => {
    h.resolved = [{ id: 'r', student_id: 's1', status: 'resolved', occurred_at: YESTERDAY }];
    expect(await listTodayReportRefs('tok')).toEqual([]);
  });
  it('excludes students not in this roster', async () => {
    h.active = [{ id: 'x', student_id: 'other', status: 'active', occurred_at: TODAY }];
    expect(await listTodayReportRefs('tok')).toEqual([]);
  });
  it('returns null for an invalid token', async () => {
    h.rosterNull = true;
    expect(await listTodayReportRefs('tok')).toBeNull();
  });
});

describe('getEnsembleReportByRef', () => {
  it('returns the most-recent today case (resolved) with status + resolution_note', async () => {
    h.studentCases['s2'] = [
      { id: 'c2', summary: 'Absent', status: 'resolved', resolution_note: 'found in dorm', occurred_at: TODAY },
      { id: 'c1', summary: 'older', status: 'resolved', occurred_at: YESTERDAY },
    ];
    const p = await getEnsembleReportByRef('tok', 1);
    expect(p?.report_summary).toBe('Absent');
    expect(p?.status).toBe('resolved');
    expect(p?.resolution_note).toBe('found in dorm');
  });
  it('returns null when the ref has no today case', async () => {
    h.studentCases['s2'] = [{ id: 'c1', summary: 'old', status: 'resolved', occurred_at: YESTERDAY }];
    expect(await getEnsembleReportByRef('tok', 1)).toBeNull();
  });
  it('returns null for an out-of-range ref', async () => {
    expect(await getEnsembleReportByRef('tok', 9)).toBeNull();
  });
});

describe('postEnsembleIncidentUpdate', () => {
  it('appends a staff_update to the active case authored by the ensemble label', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'Absent', status: 'active', occurred_at: TODAY }];
    const r = await postEnsembleIncidentUpdate('tok', 1, 'in the hall');
    expect(r).toEqual({ ok: true });
    expect(h.added).toEqual([{ caseId: 'c2', type: 'staff_update', body: 'in the hall', actor: 'Band 5' }]);
  });
  it('returns gone when there is no active case at the ref', async () => {
    h.studentCases['s2'] = [{ id: 'c2', status: 'resolved', occurred_at: TODAY }];
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
Expected: FAIL — `listTodayReportRefs`/`getEnsembleReportByRef` not exported.

- [ ] **Step 3: Implement** — replace `lib/ensemble-incidents.ts` with:

```ts
import { getRosterForToken } from './ensemble-attendance';
import { listCases, listCasesForStudent, listCaseEvents, addCaseEvent } from './cases';
import { getStudent } from './firestore';
import { getTodayDate, hourBucket } from './date';
import { toEnsembleIncidentProjection, type EnsembleIncidentProjection } from './projections';

/** Camp-tz calendar date ('YYYY-MM-DD') of an ISO instant. */
function campDate(iso: string): string {
  return hourBucket(iso).slice(0, 10);
}

/** First active case for a student, or null (used for posting updates). */
async function activeCaseFor(studentId: string) {
  const cases = await listCasesForStudent(studentId);
  return cases.find((c) => c.status === 'active') ?? null;
}

/** Most-recent case from TODAY (any status) for a student, or null.
 * listCasesForStudent is created_at desc, so the first today match is newest. */
async function mostRecentTodayCaseFor(studentId: string) {
  const today = getTodayDate();
  const cases = await listCasesForStudent(studentId);
  return cases.find((c) => campDate(c.occurred_at || c.created_at) === today) ?? null;
}

/** Roster indices (refs) whose student has a report from TODAY — active OR
 * resolved. Scopes to THIS ensemble's server-derived roster (a leaked token
 * sees only its own kids). Returns null for an invalid token. */
export async function listTodayReportRefs(token: string): Promise<number[] | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const idToRef = new Map<string, number>();
  rosterData.roster.forEach((s, i) => idToRef.set(s.id, i));
  const today = getTodayDate();
  const [active, resolved] = await Promise.all([listCases('active'), listCases('resolved')]);
  const refs = new Set<number>();
  for (const c of [...active, ...resolved]) {
    if (campDate(c.occurred_at || c.created_at) !== today) continue;
    const ref = idToRef.get(c.student_id);
    if (ref !== undefined) refs.add(ref);
  }
  return [...refs].sort((a, b) => a - b);
}

/** Scoped projection of the most-recent TODAY report (any status) for the
 * student at `ref`, or null (invalid token, out-of-range ref, no today case). */
export async function getEnsembleReportByRef(
  token: string,
  ref: number
): Promise<EnsembleIncidentProjection | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const student = rosterData.roster[ref];
  if (!student) return null;
  const c = await mostRecentTodayCaseFor(student.id);
  if (!c) return null;
  const [full, events] = await Promise.all([getStudent(student.id), listCaseEvents(c.id)]);
  return toEnsembleIncidentProjection(c, full ?? student, events);
}

/** Append a staff_update to the ACTIVE case at `ref`, authored by the ensemble
 * label. Server re-derives roster + case from the token — never trusts a client
 * id. Unchanged: the manager's typed "update" still posts to the active case. */
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

Run: `npx vitest run tests/unit/lib/ensemble-incidents.test.ts && npx tsc --noEmit`
Expected: PASS (10 tests), no type errors. (tsc will now flag the route call sites that still use the old names — that's expected; Task 3 fixes them. If tsc errors ONLY in `app/api/e/...`, proceed; if it errors in this lib, fix here.)

- [ ] **Step 5: Commit**

```bash
git add lib/ensemble-incidents.ts tests/unit/lib/ensemble-incidents.test.ts
git commit -m "feat(e-reports): today's reports (active+resolved) helpers"
```

---

## Task 3: Routes — `report_refs` on GET, today report on detail

**Files:**
- Modify: `app/api/e/[token]/route.ts` (`listActiveIncidentRefs`→`listTodayReportRefs`, `incident_refs`→`report_refs`)
- Modify: `app/api/e/[token]/incident/[ref]/route.ts` (`getEnsembleIncidentByRef`→`getEnsembleReportByRef`)
- Test: `tests/unit/api/ensemble-incident.test.ts` (rename the mock) + `tests/unit/api/ensemble-marked-absent.test.ts` (rename the mock + `report_refs`)

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces: `GET /api/e/<token>` returns `report_refs: number[]`; `GET …/incident/<ref>` returns `{ incident }` from `getEnsembleReportByRef`.

- [ ] **Step 1: Update the GET route** — `app/api/e/[token]/route.ts`:
  - Change the import `import { listActiveIncidentRefs } from '@/lib/ensemble-incidents';` → `import { listTodayReportRefs } from '@/lib/ensemble-incidents';`
  - Change `const incident_refs = (await listActiveIncidentRefs(params.token)) ?? [];` → `const report_refs = (await listTodayReportRefs(params.token)) ?? [];`
  - In the returned JSON object, change `incident_refs,` → `report_refs,`.

- [ ] **Step 2: Update the detail route** — `app/api/e/[token]/incident/[ref]/route.ts`:
  - Change `import { getEnsembleIncidentByRef } from '@/lib/ensemble-incidents';` → `import { getEnsembleReportByRef } from '@/lib/ensemble-incidents';`
  - Change `const incident = await getEnsembleIncidentByRef(params.token, ref);` → `const incident = await getEnsembleReportByRef(params.token, ref);`
  - Leave the rest (uniform 404, `{ incident }`, rate limit) unchanged.

- [ ] **Step 3: Update the route tests**

In `tests/unit/api/ensemble-incident.test.ts`: in the `vi.mock('@/lib/ensemble-incidents', …)` factory, rename `getEnsembleIncidentByRef` → `getEnsembleReportByRef` (the mock key). No assertion text needs to change (the route still returns `{ incident }`).

In `tests/unit/api/ensemble-marked-absent.test.ts`: in the `vi.mock('@/lib/ensemble-incidents', …)` factory, rename `listActiveIncidentRefs` → `listTodayReportRefs`. If the test asserts on `incident_refs` anywhere, rename to `report_refs`; otherwise no change (it focuses on `marked_absent`).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/unit/api/ensemble-incident.test.ts tests/unit/api/ensemble-marked-absent.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean except the page (`app/e/[token]/page.tsx` still references `incident_refs`) — that's Task 4. If tsc errors only in `page.tsx`, proceed.

- [ ] **Step 5: Commit**

```bash
git add "app/api/e/[token]/route.ts" "app/api/e/[token]/incident/[ref]/route.ts" tests/unit/api/ensemble-incident.test.ts tests/unit/api/ensemble-marked-absent.test.ts
git commit -m "feat(e-reports): GET returns report_refs; detail returns today report"
```

---

## Task 4: Page + layer — excused pin, "Previous Report" rows, resolved view

**Files:**
- Modify: `app/e/[token]/page.tsx`
- Modify: `app/e/[token]/StudentIncidentLayer.tsx`
- Test: `tests/unit/app/student-incident-layer.test.tsx` (add a resolved-report assertion)

**Interfaces:**
- Consumes: `report_refs` + `marked_absent` from the GET; the detail route's `{ incident }` (now with `resolution_note`).

- [ ] **Step 1: Add the failing layer test** — append to `tests/unit/app/student-incident-layer.test.tsx`:

```tsx
  it('shows the resolution note for a resolved report', async () => {
    (global.fetch as any) = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ incident: {
        first_name: 'Jane', last_initial: 'D.', instrument: 'Flute',
        report_summary: 'Absent from Band 5', status: 'resolved',
        resolution_note: 'found in dorm', updates: [],
      } }),
    }));
    render(<StudentIncidentLayer token="t" refIndex={1} name="Jane D." nowQuery="" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/found in dorm/)).toBeInTheDocument());
    // update box hidden on a resolved report
    expect(screen.queryByPlaceholderText(/add an update/i)).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/app/student-incident-layer.test.tsx`
Expected: FAIL — resolution note not rendered.

- [ ] **Step 3: Update the layer** — `app/e/[token]/StudentIncidentLayer.tsx`:
  - Add `resolution_note: string | null;` to the local `Incident` interface (after `status`).
  - Where the resolved status is shown, render the note. Add, right after the status pill block and before the summary `<p>`:
```tsx
          {incident.status === 'resolved' && incident.resolution_note && (
            <p className="mt-1 text-sm text-green-700">Resolved — {incident.resolution_note}</p>
          )}
```
  (The existing `incident.status === 'active'` guard around the textarea/Send stays — the update box remains for active reports.)

- [ ] **Step 4: Run the layer test**

Run: `npx vitest run tests/unit/app/student-incident-layer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the page** — `app/e/[token]/page.tsx`:

1. `LoadData` (line ~35): change `incident_refs: number[];` → `report_refs: number[];`
2. State (line ~69): rename `const [openIncidentRef, setOpenIncidentRef] = useState<number | null>(null);` → `const [openReportRef, setOpenReportRef] = useState<number | null>(null);`
3. Derivations (lines ~252–253): replace
   ```tsx
   const flaggedRefs = new Set(data.incident_refs ?? []);
   const flaggedRows = data.roster.filter((r) => flaggedRefs.has(r.ref));
   ```
   with
   ```tsx
   // Per-row "Previous Report" comes from today's reports (active+resolved).
   const reportRefs = new Set(data.report_refs ?? []);
   // The "Needs attention" pin now lists the kids the OFFICE excused.
   const excusedRows = data.roster.filter((r) => data.marked_absent?.[r.ref]);
   ```
4. Per-row link in `renderRow` (lines ~304–310): replace the `flaggedRefs.has(r.ref) && (…🔴 incident — view…)` block with
   ```tsx
   {reportRefs.has(r.ref) && (
     <button
       onClick={() => setOpenReportRef(r.ref)}
       className="mt-0.5 text-xs font-semibold text-red-700 underline"
     >
       📄 Previous Report →
     </button>
   )}
   ```
   (Leave the `data.marked_absent?.[r.ref]` inline-note block immediately below it unchanged.)
5. The pin (lines ~372–390): replace the `flaggedRows.length > 0 && (…)` section with the excused-kids pin:
   ```tsx
   {excusedRows.length > 0 && (
     <section className="mt-3 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 p-2">
       <h2 className="text-sm font-bold text-amber-800">Needs attention — {excusedRows.length} (excused by office)</h2>
       <ul className="mt-1 flex flex-col gap-1">
         {excusedRows.map((r) => {
           const a = data.marked_absent[r.ref];
           return (
             <li key={r.ref} className="rounded border border-amber-200 bg-white px-3 py-2 text-sm">
               <span className="font-medium text-[var(--text)]">🟡 {r.first_name} {r.last_name}</span>
               <span className="ml-2 text-xs text-amber-700">
                 out until {a.until}{a.note ? ` · ${a.note}` : ''}
               </span>
             </li>
           );
         })}
       </ul>
     </section>
   )}
   ```
6. Layer mount (lines ~466–472): rename `openIncidentRef` → `openReportRef` and `setOpenIncidentRef` → `setOpenReportRef` in the conditional, the `refIndex` prop, the name-lookup, and the `onClose`. (The `StudentIncidentLayer` import + props are unchanged.)

- [ ] **Step 6: Typecheck + full suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npx tsc --noEmit && npx vitest run tests/unit --reporter=dot`
Expected: no type errors (no remaining `incident_refs`/`openIncidentRef` references); full suite green.

- [ ] **Step 7: Commit**

```bash
git add "app/e/[token]/page.tsx" "app/e/[token]/StudentIncidentLayer.tsx" tests/unit/app/student-incident-layer.test.tsx
git commit -m "feat(e-reports): excused-kids pin + per-row Previous Report + resolved view"
```

---

## Task 5: Verify + ship

**Files:** none (release task).

- [ ] **Step 1: Full suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm test`
Expected: all green.

- [ ] **Step 2: Grep for stale references**

Run: `grep -rn "incident_refs\|listActiveIncidentRefs\|getEnsembleIncidentByRef\|openIncidentRef" app lib tests`
Expected: NO matches (all renamed). If any remain, fix + re-run the suite.

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Deploy (Node 24)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && FIREBASE_CLI_EXPERIMENTS=webframeworks FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only hosting`
Expected: `Deploy complete`.

- [ ] **Step 5: Prod smoke**

```bash
BASE=https://ttuboc-attendance.web.app
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/e/deadbeef"                       # 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/e/deadbeef/incident/0"        # 404 (bad token)
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/cases"                      # 200
```
Then David verifies interactively (real ensemble token): excused kids appear in the yellow "Needs attention" pin; a kid with a today report shows "📄 Previous Report" → opens the layer (resolved shows "Resolved — <note>", active shows the update box + Present-tap "came back" still pings the office).

- [ ] **Step 6: STATUS.md**

Add a dated session block summarizing the rework: pin → office-excused kids, incidents → per-row "Previous Report" (today active+resolved), view layer shows resolution note, update box + tardy-arrival flow retained, lib renames (`listTodayReportRefs`/`getEnsembleReportByRef`), `report_refs` payload field. Commit:
```bash
git add STATUS.md
git commit -m "docs: STATUS — /e roster reports rework"
```

---

## Self-review notes

- **Spec coverage:** projection `resolution_note` → Task 1; today-report helpers → Task 2; `report_refs` GET + detail route → Task 3; excused pin + "Previous Report" rows + resolved view + renames → Task 4; verify/ship → Task 5. All spec sections mapped.
- **Renames are total:** Task 5 Step 2 greps to prove no stale `incident_refs`/`listActiveIncidentRefs`/`getEnsembleIncidentByRef`/`openIncidentRef` remain.
- **Kept intact:** `postEnsembleIncidentUpdate` + `…/update` route + the layer's active-only update box + `submitEnsembleAttendance` tardy-arrival — none are touched.
- **Type consistency:** `EnsembleIncidentProjection.resolution_note` (Task 1) is read by the layer (Task 4) and returned by `getEnsembleReportByRef` (Task 2). `report_refs` named identically in route (Task 3) and page (Task 4). `listTodayReportRefs`/`getEnsembleReportByRef` signatures identical across Tasks 2/3.
- **Privacy/perf:** projection adds only office-authored `resolution_note`; today-filter is in-code over active+resolved (no new index) — noted in the spec's Perf section.
