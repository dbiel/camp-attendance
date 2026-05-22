# Admin Coverage Dashboard + Tardy Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/coverage` (color-coded session-attendance grid) and `/admin/faculty-status` (faculty roll-up), and remove the Tardy status from the entire system.

**Architecture:** Tardy removal goes first (purely subtractive) so the coverage state-machine can rely on `status: 'present' | 'absent'`. Then a pure-function color rule in `lib/attendance-rules.ts`, a server aggregation `getDayCoverage` reusing existing helpers, a thin API route, then two new admin pages backed by a Firestore listener for live updates.

**Tech Stack:** Next.js 14 App Router · TypeScript · Firebase Admin SDK (server) + Firebase JS SDK (client `onSnapshot`) · Vitest · Playwright · Tailwind.

**Prereq:** Branch `feat/admin-coverage-dashboard` already exists with the design spec committed. Use Node 24 (`source $(brew --prefix nvm)/nvm.sh && nvm use 24`) for all `npm` / `git push` commands.

---

## Task 1: Drop `'tardy'` from shared type unions

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Edit `Attendance.status` and `AttendanceDenormalized.status`**

In `lib/types.ts` change both unions from `'present' | 'absent' | 'tardy'` to `'present' | 'absent'`:

```ts
export interface Attendance {
  // ...existing fields...
  status: 'present' | 'absent';
  // ...
}

export interface AttendanceDenormalized {
  // ...existing fields...
  status: 'present' | 'absent';
  // ...
}
```

- [ ] **Step 2: Remove `tardy_count` from `FacultySessionRow`**

```ts
export interface FacultySessionRow {
  // ...existing fields...
  total_students: number;
  present_count: number;
  absent_count: number;
  // tardy_count: number;   ← delete this line
}
```

- [ ] **Step 3: Drop `'tardy'` from `StudentScheduleRow.attendance_status`**

```ts
export interface StudentScheduleRow {
  // ...existing fields...
  attendance_status: 'present' | 'absent' | 'unmarked';
  // ...
}
```

- [ ] **Step 4: Drop `'tardy'` from `AttendanceReport.status`**

```ts
export interface AttendanceReport {
  // ...existing fields...
  status: 'absent';
  // ...
}
```

- [ ] **Step 5: Remove `tardy` from `DailyStats`**

```ts
export interface DailyStats {
  present: number;
  absent: number;
  // tardy: number;   ← delete
  unmarked: number;
  total: number;
}
```

- [ ] **Step 6: Verify typecheck reports errors at the consumer call-sites**

Run: `npm run typecheck`
Expected: FAILS with errors in `lib/firestore.ts`, `app/api/...`, `app/admin/...`, `app/teacher/...` — those will be fixed in later tasks. **Do not commit yet** — keep the working tree dirty through Task 7, then commit Tardy-removal as one cohesive change.

---

## Task 2: Drop tardy from server queries (`lib/firestore.ts`)

**Files:**
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Fix `getFacultySessions` aggregation**

In the loop starting at line 481, remove the `tardyCount` variable and stop checking `'tardy'`:

```ts
let presentCount = 0, absentCount = 0;
for (const attDoc of attSnap.docs) {
  if (attDoc.data().date !== todayDate) continue;
  const st = attDoc.data().status;
  if (st === 'present') presentCount++;
  else if (st === 'absent') absentCount++;
}

results.push({
  // ...existing fields...
  total_students: totalStudents,
  present_count: presentCount,
  absent_count: absentCount,
  // tardy_count: tardyCount,  ← delete
});
```

- [ ] **Step 2: Fix `getStudentSchedule` status union**

Around line 537 the inferred attendance_status currently includes `'tardy'`. Change the local var and the resulting row type to omit `'tardy'`:

```ts
let attendance_status: 'present' | 'absent' | 'unmarked' = 'unmarked';
```

Anywhere the function maps a Firestore status into the row, if the value is `'tardy'` (legacy), coerce to `'present'`:

```ts
const raw = attDoc.data().status;
attendance_status = raw === 'tardy' ? 'present' : (raw as 'present' | 'absent');
```

- [ ] **Step 3: Fix `getAttendanceReport`**

Around line 401, drop the `'tardy'` filter branch:

```ts
export async function getAttendanceReport(date: string): Promise<AttendanceReport[]> {
  // remove the status?: 'absent' | 'tardy' param
  // ...
  const filtered = snap.docs.filter(doc => doc.data().status === 'absent');
  // ...
  status: 'absent',
}
```

- [ ] **Step 4: Fix `getDailyStats`**

Around line 836, drop tardy bucket and the `tardy` field:

```ts
let present = 0, absent = 0, unmarked = 0;
for (const sDoc of studentsSnap.docs) {
  const statuses = studentStatuses.get(sDoc.id);
  if (!statuses) unmarked++;
  else if (statuses.has('absent')) absent++;
  else if (statuses.has('present')) present++;
  // legacy 'tardy' values coerce to present
  else if (statuses.has('tardy')) present++;
  else unmarked++;
}
return { present, absent, unmarked, total: totalStudents };
```

- [ ] **Step 5: Update `markAttendance` parameter type**

Line 193: `status: 'present' | 'absent' | 'tardy'` → `status: 'present' | 'absent'`.

Line 266: same change inside `markAttendanceBatch`.

Line 675: `status: 'present' | 'absent' | 'tardy' | 'unmarked'` → `status: 'present' | 'absent' | 'unmarked'`.

- [ ] **Step 6: Re-run typecheck to confirm `lib/firestore.ts` is clean**

Run: `npm run typecheck`
Expected: Errors remain only in `app/api/...`, `app/admin/...`, `app/teacher/...`.

---

## Task 3: Drop `'tardy'` from `lib/attendance-queue.ts`

**Files:**
- Modify: `lib/attendance-queue.ts`

- [ ] **Step 1: Narrow the exported status union**

Line 11:

```ts
export type AttendanceStatus = 'present' | 'absent';
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: errors now only in `app/...` files.

---

## Task 4: Drop tardy from attendance API routes

**Files:**
- Modify: `app/api/attendance/route.ts`
- Modify: `app/api/attendance/batch/route.ts`
- Modify: `app/api/attendance/report/route.ts`

- [ ] **Step 1: `app/api/attendance/route.ts`**

Lines 13–14:

```ts
const ALLOWED_STATUSES = new Set(['present', 'absent'] as const);
type AttendanceStatus = 'present' | 'absent';
```

A POST body with `status: 'tardy'` will now return 400; that's intentional and matches the design.

- [ ] **Step 2: `app/api/attendance/batch/route.ts`**

Line 10:

```ts
const VALID_STATUSES = new Set(['present', 'absent']);
```

Line 56:

```ts
status: it.status as 'present' | 'absent',
```

- [ ] **Step 3: `app/api/attendance/report/route.ts`**

Line 18: drop the `status` parameter handling and the optional second argument:

```ts
const report = await getAttendanceReport(date);
```

Update the route signature so the query param `?status=...` is ignored (or returns 400 if passed an unsupported value — your call; ignore for simplicity).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: errors remain only in `app/api/stats/...`, `app/admin/...`, `app/teacher/...`.

---

## Task 5: Drop tardy from `app/api/stats/route.ts`

**Files:**
- Modify: `app/api/stats/route.ts`

- [ ] **Step 1: Remove the `tardy` field from the response shape**

Around line 30, remove `tardy: stats.tardy || 0,` from the JSON returned.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `app/admin/...` and `app/teacher/...`.

---

## Task 6: Drop tardy from teacher UI

**Files:**
- Modify: `app/teacher/[id]/page.tsx`
- Modify: `app/teacher/[id]/session/[sessionId]/page.tsx`

- [ ] **Step 1: Faculty home page — drop the T pill and the tardy term**

`app/teacher/[id]/page.tsx`:

Line 208: drop `+ session.tardy_count`:

```tsx
<div className="text-xs">{session.present_count + session.absent_count}/{session.total_students}</div>
```

Lines 223–225: remove the `<span>` block displaying `T {session.tardy_count}`.

Line 227: drop the term from the unmarked calc:

```tsx
? {session.total_students - (session.present_count + session.absent_count)}
```

- [ ] **Step 2: Session attendance page — drop tardy from the client cycle**

`app/teacher/[id]/session/[sessionId]/page.tsx`:

Line 33: narrow `ClientStatus`:

```ts
type ClientStatus = 'unmarked' | 'present' | 'absent';
```

Lines 224–230: simplify `toggleAttendance`:

```ts
function toggleAttendance(studentId: string) {
  const current = attendance.get(studentId) || 'unmarked';
  let next: ClientStatus;
  if (current === 'unmarked') next = 'present';
  else if (current === 'present') next = 'absent';
  else next = 'unmarked';
  // ...rest unchanged...
}
```

Lines 247–249: drop the `tardy` branch in `saveAttendance`.

Line 334: drop `s === 'tardy'` from the unmarkedCount filter.

Line 427: drop `status === 'tardy'` from `isPressed`.

Line 449: delete `{status === 'tardy' && 'T'}`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `app/admin/dashboard/...`.

---

## Task 7: Drop tardy from admin dashboard

**Files:**
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `app/admin/dashboard/StudentDetailModal.tsx`

- [ ] **Step 1: Dashboard — narrow types and remove the Tardy UI**

`app/admin/dashboard/page.tsx`:

Line 45: `status: 'absent';`

Line 89: `useState<'' | 'absent'>('absent');`

Line 122: drop the `'tardy'` element from the `in` clause:

```ts
where('status', '==', 'absent')
```

(Since the only remaining filtered status is `'absent'`, you can use `==` instead of `in`.)

Line 260: delete `const tardyCount = ...` line.

Lines 432–456: delete the entire `{/* Absent / Tardy Toggle */}` div containing both buttons and replace with a single absent counter:

```tsx
<div className="bg-red-50 border-2 border-red-300 rounded-lg py-4 text-center mb-4">
  <div className="text-3xl font-bold text-red-600">{absentCount}</div>
  <div className="text-sm font-bold text-red-600">Absent</div>
</div>
```

Lines 595, 597: remove tardy conditionals — group header always uses the red badge.

- [ ] **Step 2: StudentDetailModal — narrow types**

`app/admin/dashboard/StudentDetailModal.tsx`:

Line 11:

```ts
export type AttendanceStatus = 'present' | 'absent';
```

Line 97 (case 'tardy'): delete the case.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 4: Commit all of Task 1–7**

```bash
git add lib/types.ts lib/firestore.ts lib/attendance-queue.ts \
  app/api/attendance/route.ts app/api/attendance/batch/route.ts \
  app/api/attendance/report/route.ts app/api/stats/route.ts \
  app/teacher/\[id\]/page.tsx \
  app/teacher/\[id\]/session/\[sessionId\]/page.tsx \
  app/admin/dashboard/page.tsx app/admin/dashboard/StudentDetailModal.tsx

git commit -m "$(cat <<'EOF'
refactor: remove tardy status from types, server, and UI

Tardy is being removed from the system per design. Server-side
status union narrows to 'present' | 'absent'; teacher cycle becomes
two-state (present <-> absent); admin dashboard becomes absence-only.
Legacy tardy docs in Firestore are coerced to 'present' on read
until the migration script runs (Task 15).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Prune tardy assertions from existing tests

**Files:**
- Modify: `tests/unit/api/attendance-post.test.ts`
- Modify: `tests/unit/api/attendance-batch.test.ts`
- Modify: `tests/integration/api/attendance.test.ts`
- Modify: `tests/integration/api/attendance-batch.test.ts`
- Modify: `tests/integration/api/attendance-report.test.ts`
- Modify: `tests/integration/api/rollover.test.ts`
- Modify: `tests/integration/api/stats.test.ts`

- [ ] **Step 1: Run failing tests to see what needs pruning**

Run: `npm test 2>&1 | grep -E "FAIL|tardy" | head -30`
Expected: Multiple test failures referencing `'tardy'`.

- [ ] **Step 2: For each file above, delete or rewrite tests asserting tardy behavior**

For any test that posts `status: 'tardy'` expecting success, change it to expect a 400 (now invalid input). For any tally test counting `tardy: N`, remove the field. Migration-related tests already check status mapping — update them to expect `'present'`.

Specifics — for each file, follow this pattern:

```ts
// Before:
expect(res.status).toBe(200);
expect(body).toMatchObject({ status: 'tardy' });

// After:
expect(res.status).toBe(400);
expect(body.error).toMatch(/status/i);
```

For aggregation tests (`stats.test.ts`, `attendance-batch.test.ts`), drop the `tardy` assertion line; leave the rest.

- [ ] **Step 3: Re-run tests**

Run: `npm test`
Expected: All tests pass on Node 24. Total count drops from 266 by however many tardy-specific assertions you removed (~10–15).

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: drop tardy assertions, tighten status validation tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Add `lib/attendance-rules.ts` with `deriveCellState`

**Files:**
- Create: `lib/attendance-rules.ts`
- Create: `tests/unit/lib/attendance-rules.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/attendance-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveCellState, ATTENDANCE_MOSTLY_TAKEN_THRESHOLD } from '@/lib/attendance-rules';

describe('deriveCellState', () => {
  it('returns not-started when nothing marked', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 0, absent_count: 0 }))
      .toBe('not-started');
  });

  it('returns in-progress when some marked but under threshold and no absences', () => {
    // 80% of 20 = 16, so 15 marked is in-progress
    expect(deriveCellState({ total_students: 20, marked_count: 15, absent_count: 0 }))
      .toBe('in-progress');
  });

  it('returns mostly-done at exactly the threshold with no absences', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 16, absent_count: 0 }))
      .toBe('mostly-done');
  });

  it('returns mostly-done when all marked and none absent', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 20, absent_count: 0 }))
      .toBe('mostly-done');
  });

  it('returns has-absences whenever any absent exists, regardless of coverage', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 2, absent_count: 2 }))
      .toBe('has-absences');
    expect(deriveCellState({ total_students: 20, marked_count: 20, absent_count: 3 }))
      .toBe('has-absences');
  });

  it('handles empty roster gracefully (returns not-started)', () => {
    expect(deriveCellState({ total_students: 0, marked_count: 0, absent_count: 0 }))
      .toBe('not-started');
  });

  it('exposes the threshold constant', () => {
    expect(ATTENDANCE_MOSTLY_TAKEN_THRESHOLD).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- attendance-rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

`lib/attendance-rules.ts`:

```ts
export const ATTENDANCE_MOSTLY_TAKEN_THRESHOLD = 0.8;

export type CellState = 'not-started' | 'in-progress' | 'mostly-done' | 'has-absences';

export function deriveCellState(args: {
  total_students: number;
  marked_count: number;
  absent_count: number;
}): CellState {
  const { total_students, marked_count, absent_count } = args;
  if (absent_count > 0) return 'has-absences';
  if (total_students === 0 || marked_count === 0) return 'not-started';
  if (marked_count >= total_students * ATTENDANCE_MOSTLY_TAKEN_THRESHOLD) {
    return 'mostly-done';
  }
  return 'in-progress';
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- attendance-rules.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/attendance-rules.ts tests/unit/lib/attendance-rules.test.ts
git commit -m "feat: deriveCellState rule for coverage dashboard

Pure function mapping (total, marked, absent) -> cell state.
Threshold lives at 80% for the 'mostly-done' boundary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Add `getDayCoverage` to `lib/firestore.ts`

**Files:**
- Modify: `lib/firestore.ts`
- Modify: `lib/types.ts` (add CoverageRow)
- Create: `tests/unit/lib/firestore-coverage.test.ts`

- [ ] **Step 1: Add the CoverageRow type**

In `lib/types.ts`, add:

```ts
export interface CoverageRow {
  session_id: string;
  session_name: string;
  period_id: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  ensemble: string | null;
  instrument: string | null;
  faculty_id: string | null;
  teacher_name: string;
  total_students: number;
  marked_count: number;
  absent_count: number;
}
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/firestore-coverage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin and the adminDb proxy before importing the module
vi.mock('@/lib/firebase-admin', () => {
  const fakeDocs = {
    sessions: [
      { id: 's1', period_id: 'p1', name: 'Brass Sectional', type: 'sectional', faculty_id: 'f1', ensemble: 'Band 1', instrument: 'Trumpet' },
    ],
    periods: [
      { id: 'p1', number: 1, name: 'Period 1', start_time: '8:00', end_time: '8:50' },
    ],
    faculty: [{ id: 'f1', first_name: 'John', last_name: 'Smith' }],
    sessionStudents: [
      { session_id: 's1', student_id: 'u1' },
      { session_id: 's1', student_id: 'u2' },
      { session_id: 's1', student_id: 'u3' },
    ],
    attendance: [
      { session_id: 's1', student_id: 'u1', date: '2026-06-08', status: 'present' },
      { session_id: 's1', student_id: 'u2', date: '2026-06-08', status: 'absent' },
    ],
  };
  // Minimal stub: each collection() returns an object whose .where().get()
  // (and bare .get()) yields { empty, docs: [{ id, data: () => doc }] }.
  const collectionStub = (name: keyof typeof fakeDocs) => {
    const all = fakeDocs[name];
    const toSnap = (rows: any[]) => ({
      empty: rows.length === 0,
      size: rows.length,
      docs: rows.map((d: any) => ({ id: d.id ?? `${name}-${rows.indexOf(d)}`, data: () => d })),
    });
    const queryable = {
      get: async () => toSnap(all as any[]),
      where: (field: string, _op: string, value: any) => ({
        get: async () => toSnap((all as any[]).filter((d) => d[field] === value)),
      }),
      doc: (id: string) => ({
        get: async () => {
          const d = (all as any[]).find((x) => x.id === id);
          return { exists: !!d, data: () => d };
        },
      }),
    };
    return queryable;
  };
  return {
    adminDb: {
      collection: (name: string) => collectionStub(name as keyof typeof fakeDocs),
    },
  };
});

import { getDayCoverage } from '@/lib/firestore';

describe('getDayCoverage', () => {
  it('returns one row per session with marked + absent counts', async () => {
    const rows = await getDayCoverage('2026-06-08');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      session_id: 's1',
      total_students: 3,
      marked_count: 2,
      absent_count: 1,
      teacher_name: 'John Smith',
      ensemble: 'Band 1',
    });
  });

  it('returns marked_count 0 and absent_count 0 when no attendance docs exist', async () => {
    // re-mock with empty attendance
    // ...
  });
});
```

Reuse the existing `makeFakeAdminDb` helper pattern from `tests/unit/lib/firestore.test.ts` if one exists; otherwise write a minimal inline stub returning `{ get: () => ({ docs: [...] }) }`.

- [ ] **Step 3: Run the failing test**

Run: `npm test -- firestore-coverage.test.ts`
Expected: FAIL — `getDayCoverage` is not exported.

- [ ] **Step 4: Implement `getDayCoverage`**

Add to `lib/firestore.ts` (near `getFacultySessions`):

```ts
export async function getDayCoverage(date: string): Promise<CoverageRow[]> {
  const sessSnap = await sessionsCol().get();
  if (sessSnap.empty) return [];

  const periods = await getPeriods();
  const periodMap = new Map(periods.map(p => [p.id, p]));

  const facultyList = await getFaculty();
  const facultyMap = new Map(facultyList.map(f => [f.id, f]));

  // Pull all attendance for the date in one query, then bucket per session
  const attSnap = await attendanceCol().where('date', '==', date).get();
  const byCount = new Map<string, { marked: number; absent: number }>();
  for (const doc of attSnap.docs) {
    const d = doc.data();
    const bucket = byCount.get(d.session_id) ?? { marked: 0, absent: 0 };
    bucket.marked++;
    if (d.status === 'absent') bucket.absent++;
    byCount.set(d.session_id, bucket);
  }

  const rows: CoverageRow[] = [];
  for (const sessDoc of sessSnap.docs) {
    const sess = { id: sessDoc.id, ...sessDoc.data() } as Session;
    const period = periodMap.get(sess.period_id);
    const enrolledSnap = await sessionStudentsCol()
      .where('session_id', '==', sess.id)
      .get();
    const counts = byCount.get(sess.id) ?? { marked: 0, absent: 0 };
    const teacher = sess.faculty_id ? facultyMap.get(sess.faculty_id) : undefined;
    rows.push({
      session_id: sess.id,
      session_name: sess.name,
      period_id: sess.period_id,
      period_number: period?.number ?? 0,
      period_name: period?.name ?? '',
      start_time: period?.start_time ?? '',
      end_time: period?.end_time ?? '',
      ensemble: sess.ensemble ?? null,
      instrument: sess.instrument ?? null,
      faculty_id: sess.faculty_id ?? null,
      teacher_name: teacher ? `${teacher.first_name} ${teacher.last_name}` : '',
      total_students: enrolledSnap.size,
      marked_count: counts.marked,
      absent_count: counts.absent,
    });
  }

  rows.sort((a, b) => {
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    return a.session_name.localeCompare(b.session_name);
  });
  return rows;
}
```

Add `CoverageRow` to the existing import block from `./types`.

- [ ] **Step 5: Run tests**

Run: `npm test -- firestore-coverage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/firestore.ts lib/types.ts tests/unit/lib/firestore-coverage.test.ts
git commit -m "feat: getDayCoverage aggregator for /api/attendance/coverage

Returns one row per session for a given date with marked_count and
absent_count derived from the attendance collection. Reuses periods
and faculty for display fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Add `GET /api/attendance/coverage` route

**Files:**
- Create: `app/api/attendance/coverage/route.ts`
- Create: `tests/unit/api/attendance-coverage.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/api/attendance-coverage.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: (_role: string, handler: any) => handler,
}));
vi.mock('@/lib/firestore', () => ({
  getDayCoverage: vi.fn(async (date: string) => [
    { session_id: 's1', total_students: 3, marked_count: 2, absent_count: 1, /* ...other fields elided... */ },
  ]),
}));

import { GET } from '@/app/api/attendance/coverage/route';

describe('GET /api/attendance/coverage', () => {
  it('400 when date param missing', async () => {
    const req = new NextRequest('http://localhost/api/attendance/coverage');
    const res = await GET(req, { params: {}, role: 'admin' } as any);
    expect(res.status).toBe(400);
  });

  it('returns coverage rows for the date', async () => {
    const req = new NextRequest('http://localhost/api/attendance/coverage?date=2026-06-08');
    const res = await GET(req, { params: {}, role: 'admin' } as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      session_id: 's1',
      total_students: 3,
      marked_count: 2,
      absent_count: 1,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- attendance-coverage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

`app/api/attendance/coverage/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDayCoverage } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth('admin', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'Missing date' }, { status: 400 });
  }
  const rows = await getDayCoverage(date);
  return NextResponse.json({ rows });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- attendance-coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/attendance/coverage/route.ts tests/unit/api/attendance-coverage.test.ts
git commit -m "feat(api): GET /api/attendance/coverage?date=YYYY-MM-DD

Admin-only. Returns one row per session with total/marked/absent
counts for the date. Page uses this for the initial paint before
the Firestore listener catches up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Build `/admin/coverage` page + components

**Files:**
- Create: `app/admin/coverage/page.tsx`
- Create: `app/admin/coverage/CoverageGrid.tsx`
- Create: `app/admin/coverage/SessionCard.tsx`
- Create: `app/admin/coverage/CoverageFilters.tsx`

- [ ] **Step 1: Create `SessionCard.tsx`**

```tsx
'use client';

import { deriveCellState, CellState } from '@/lib/attendance-rules';
import type { CoverageRow } from '@/lib/types';

interface Props {
  row: CoverageRow;
  onClick: () => void;
}

const COLOR: Record<CellState, string> = {
  'not-started': 'bg-gray-100 border-gray-300 text-gray-700',
  'in-progress': 'bg-yellow-50 border-yellow-300 text-yellow-900',
  'mostly-done': 'bg-green-50 border-green-400 text-green-900',
  'has-absences': 'bg-red-50 border-red-400 text-red-900',
};

const ICON: Record<CellState, string> = {
  'not-started': '—',
  'in-progress': '◴',
  'mostly-done': '✓',
  'has-absences': '⚠',
};

export function SessionCard({ row, onClick }: Props) {
  const state = deriveCellState({
    total_students: row.total_students,
    marked_count: row.marked_count,
    absent_count: row.absent_count,
  });
  const badge = state === 'has-absences'
    ? `${row.absent_count}/${row.total_students} absent`
    : `${row.marked_count}/${row.total_students}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border-2 transition-all hover:shadow-md ${COLOR[state]}`}
      aria-label={`${row.session_name}, ${state}, ${badge}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-bold truncate">
            <span aria-hidden="true" className="mr-2">{ICON[state]}</span>
            {row.session_name}
          </div>
          <div className="text-xs opacity-75 truncate">
            {row.teacher_name}
            {row.ensemble && ` · ${row.ensemble}`}
          </div>
        </div>
        <div className="text-xs font-semibold whitespace-nowrap">
          {badge}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create `CoverageFilters.tsx`**

```tsx
'use client';

import { CellState } from '@/lib/attendance-rules';

interface Props {
  teachers: { id: string; name: string }[];
  ensembles: string[];
  selectedTeacher: string;
  selectedEnsemble: string;
  selectedState: CellState | 'all';
  onChange: (next: {
    teacher?: string;
    ensemble?: string;
    state?: CellState | 'all';
  }) => void;
}

const STATE_LABEL: Record<CellState | 'all', string> = {
  'all': 'All',
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'mostly-done': 'Mostly done',
  'has-absences': 'Has absences',
};

export function CoverageFilters({
  teachers, ensembles, selectedTeacher, selectedEnsemble, selectedState, onChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <select
        className="camp-input w-48"
        value={selectedTeacher}
        onChange={(e) => onChange({ teacher: e.target.value })}
        aria-label="Filter by teacher"
      >
        <option value="">All Teachers</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <select
        className="camp-input w-40"
        value={selectedEnsemble}
        onChange={(e) => onChange({ ensemble: e.target.value })}
        aria-label="Filter by ensemble"
      >
        <option value="">All Ensembles</option>
        {ensembles.map((e) => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>

      <div className="flex gap-1">
        {(['all', 'not-started', 'in-progress', 'mostly-done', 'has-absences'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ state: s })}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              selectedState === s
                ? 'bg-camp-green text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {STATE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `CoverageGrid.tsx`**

```tsx
'use client';

import { useMemo } from 'react';
import { SessionCard } from './SessionCard';
import type { CoverageRow } from '@/lib/types';

interface Props {
  rows: CoverageRow[];
  onSessionClick: (sessionId: string) => void;
}

export function CoverageGrid({ rows, onSessionClick }: Props) {
  const grouped = useMemo(() => {
    const byPeriod = new Map<number, CoverageRow[]>();
    for (const r of rows) {
      if (!byPeriod.has(r.period_number)) byPeriod.set(r.period_number, []);
      byPeriod.get(r.period_number)!.push(r);
    }
    return Array.from(byPeriod.entries()).sort(([a], [b]) => a - b);
  }, [rows]);

  if (grouped.length === 0) {
    return <div className="text-center p-8 text-gray-500">No sessions match your filters.</div>;
  }

  return (
    <div className="space-y-6">
      {grouped.map(([periodNumber, periodRows]) => (
        <section key={periodNumber}>
          <h2 className="text-sm font-bold text-gray-600 mb-2">
            {periodRows[0].period_name} · {periodRows[0].start_time}–{periodRows[0].end_time}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {periodRows.map((row) => (
              <SessionCard
                key={row.session_id}
                row={row}
                onClick={() => onSessionClick(row.session_id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `page.tsx`**

```tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel } from '@/lib/date';
import { db as clientDb } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { CoverageRow } from '@/lib/types';
import { CellState } from '@/lib/attendance-rules';
import { CoverageGrid } from './CoverageGrid';
import { CoverageFilters } from './CoverageFilters';

export default function AdminCoverage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [teacherFilter, setTeacherFilter] = useState('');
  const [ensembleFilter, setEnsembleFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<CellState | 'all'>('all');

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (config && selectedDay === null) {
      const firstDay = Object.keys(config.day_dates)[0] ?? 'M';
      setSelectedDay(todayKey ?? firstDay);
    }
  }, [config, todayKey, selectedDay]);

  // Initial snapshot from API
  useEffect(() => {
    if (!user || !config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) return;
    setLoading(true);
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance/coverage?date=${date}`, { headers });
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows as CoverageRow[]);
      }
      setLoading(false);
    })();
  }, [user, config, selectedDay, getAuthHeaders]);

  // Live listener: any attendance change for the date re-fetches counts
  // (simple + correct; resists complex client-side delta math).
  useEffect(() => {
    if (!user || !config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) return;

    const q = query(collection(clientDb, 'attendance'), where('date', '==', date));
    const unsub = onSnapshot(q, async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance/coverage?date=${date}`, { headers });
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows as CoverageRow[]);
      }
    });
    return () => unsub();
  }, [user, config, selectedDay, getAuthHeaders]);

  const teachers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.faculty_id) map.set(r.faculty_id, r.teacher_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const ensembles = useMemo(
    () => Array.from(new Set(rows.map(r => r.ensemble).filter((v): v is string => !!v))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (teacherFilter && r.faculty_id !== teacherFilter) return false;
      if (ensembleFilter && r.ensemble !== ensembleFilter) return false;
      if (stateFilter !== 'all') {
        const { deriveCellState } = require('@/lib/attendance-rules');
        const s = deriveCellState({
          total_students: r.total_students,
          marked_count: r.marked_count,
          absent_count: r.absent_count,
        });
        if (s !== stateFilter) return false;
      }
      return true;
    });
  }, [rows, teacherFilter, ensembleFilter, stateFilter]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-2">
            <Link href="/" className="text-sm opacity-75 hover:opacity-100">&larr; Home</Link>
            <button onClick={() => signOut()} className="text-xs opacity-75 hover:opacity-100 underline">
              Sign Out
            </button>
          </div>
          <h1 className="text-2xl font-bold">Coverage</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-3">
          {config && Object.keys(config.day_dates).map((dayKey) => {
            const isSelected = dayKey === selectedDay;
            const isToday = dayKey === todayKey;
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDay(dayKey)}
                aria-label={`${formatDayLabel(dayKey)}${isToday ? ' (today)' : ''}`}
                className={`flex-1 py-3 rounded-lg font-bold text-lg ${
                  isSelected ? 'bg-camp-green text-white shadow-md'
                             : 'bg-white text-camp-green border-2 border-camp-green'
                }`}
              >
                {dayKey}
              </button>
            );
          })}
        </div>

        <CoverageFilters
          teachers={teachers}
          ensembles={ensembles}
          selectedTeacher={teacherFilter}
          selectedEnsemble={ensembleFilter}
          selectedState={stateFilter}
          onChange={(next) => {
            if (next.teacher !== undefined) setTeacherFilter(next.teacher);
            if (next.ensemble !== undefined) setEnsembleFilter(next.ensemble);
            if (next.state !== undefined) setStateFilter(next.state);
          }}
        />

        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : (
          <CoverageGrid rows={filtered} onSessionClick={() => { /* session-detail modal wired in a follow-up PR */ }} />
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <Link href="/admin/dashboard" className="camp-btn-outline block text-center py-3 font-semibold">
            Absences
          </Link>
          <Link href="/admin/faculty-status" className="camp-btn-outline block text-center py-3 font-semibold">
            Faculty Status
          </Link>
          <Link href="/admin/data/students" className="camp-btn-outline block text-center py-3 font-semibold">
            Students
          </Link>
          <Link href="/admin/data/faculty" className="camp-btn-outline block text-center py-3 font-semibold">
            Faculty
          </Link>
          <Link href="/admin/settings" className="camp-btn-outline block text-center py-3 font-semibold">
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Smoke-test in the browser**

Run: `npm run dev` (Node 24 active)
Open: `http://localhost:3000/admin/coverage`
Expected: Day chips render, filters render, sessions appear grouped by period with appropriate colors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/coverage/
git commit -m "feat(admin): /admin/coverage page with live coverage grid

Periods x sessions, color-coded via deriveCellState, teacher and
ensemble filters, live updates via Firestore listener.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Build `/admin/faculty-status` page

**Files:**
- Create: `app/admin/faculty-status/page.tsx`
- Create: `app/admin/faculty-status/FacultyGrid.tsx`

- [ ] **Step 1: Create `FacultyGrid.tsx`**

```tsx
'use client';

import { useMemo } from 'react';
import { deriveCellState } from '@/lib/attendance-rules';
import type { CoverageRow } from '@/lib/types';

interface Props {
  rows: CoverageRow[];
  onlyBehind: boolean;
  onCellClick: (sessionId: string) => void;
}

const CELL_COLOR: Record<string, string> = {
  'not-started': 'bg-gray-200 text-gray-700',
  'in-progress': 'bg-yellow-200 text-yellow-900',
  'mostly-done': 'bg-green-200 text-green-900',
  'has-absences': 'bg-red-200 text-red-900',
};

const ICON: Record<string, string> = {
  'not-started': '—',
  'in-progress': '◴',
  'mostly-done': '✓',
  'has-absences': '⚠',
};

export function FacultyGrid({ rows, onlyBehind, onCellClick }: Props) {
  const byFaculty = useMemo(() => {
    const map = new Map<string, { name: string; rows: CoverageRow[] }>();
    for (const r of rows) {
      if (!r.faculty_id) continue;
      if (!map.has(r.faculty_id)) {
        map.set(r.faculty_id, { name: r.teacher_name, rows: [] });
      }
      map.get(r.faculty_id)!.rows.push(r);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const periodNumbers = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.period_number))).sort((a, b) => a - b);
  }, [rows]);

  const isBehind = (facultyRows: CoverageRow[]) => {
    const now = Date.now();
    for (const r of facultyRows) {
      const endTime = new Date().toISOString().slice(0, 10) + 'T' + r.end_time + ':00';
      const ended = new Date(endTime).getTime() < now;
      if (!ended) continue;
      const s = deriveCellState({
        total_students: r.total_students,
        marked_count: r.marked_count,
        absent_count: r.absent_count,
      });
      if (s !== 'mostly-done') return true;
    }
    return false;
  };

  const visibleFaculty = onlyBehind ? byFaculty.filter(f => isBehind(f.rows)) : byFaculty;

  if (visibleFaculty.length === 0) {
    return <div className="text-center p-8 text-gray-500">All caught up.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left bg-gray-100">Faculty</th>
            {periodNumbers.map((n) => (
              <th key={n} className="px-2 py-2 text-center bg-gray-100">P{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleFaculty.map(({ id, name, rows: fRows }) => (
            <tr key={id} className="border-b border-gray-100">
              <td className="px-2 py-2 font-semibold whitespace-nowrap">{name}</td>
              {periodNumbers.map((n) => {
                const r = fRows.find(x => x.period_number === n);
                if (!r) return <td key={n} className="px-1 py-1" />;
                const state = deriveCellState({
                  total_students: r.total_students,
                  marked_count: r.marked_count,
                  absent_count: r.absent_count,
                });
                return (
                  <td key={n} className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => onCellClick(r.session_id)}
                      className={`w-full rounded text-xs font-bold py-1 ${CELL_COLOR[state]}`}
                      aria-label={`${name} period ${n}, ${state}, ${r.marked_count}/${r.total_students}`}
                    >
                      <span aria-hidden="true" className="mr-1">{ICON[state]}</span>
                      {r.marked_count}/{r.total_students}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `page.tsx`**

Pattern matches `app/admin/coverage/page.tsx` (day selector + live listener) but renders `<FacultyGrid>` instead. Reuse the snapshot/listener code verbatim — extract into `useDayCoverage(date)` hook if you have appetite for it, or copy-paste this time and refactor later.

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel } from '@/lib/date';
import { db as clientDb } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { CoverageRow } from '@/lib/types';
import { FacultyGrid } from './FacultyGrid';
import { deriveCellState } from '@/lib/attendance-rules';

export default function AdminFacultyStatus() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const { config } = useCampConfig();
  const todayKey = useTodayDayKey();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [onlyBehind, setOnlyBehind] = useState(false);

  useEffect(() => { if (!authLoading && !user) router.push('/admin'); }, [user, authLoading, router]);

  useEffect(() => {
    if (config && selectedDay === null) {
      setSelectedDay(todayKey ?? Object.keys(config.day_dates)[0] ?? 'M');
    }
  }, [config, todayKey, selectedDay]);

  useEffect(() => {
    if (!user || !config || !selectedDay) return;
    const date = dayKeyToDate(selectedDay, config.day_dates);
    if (!date) return;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance/coverage?date=${date}`, { headers });
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows as CoverageRow[]);
      }
    })();
    const q = query(collection(clientDb, 'attendance'), where('date', '==', date));
    const unsub = onSnapshot(q, async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance/coverage?date=${date}`, { headers });
      if (res.ok) {
        const body = await res.json();
        setRows(body.rows as CoverageRow[]);
      }
    });
    return () => unsub();
  }, [user, config, selectedDay, getAuthHeaders]);

  const facultyTotals = (() => {
    const map = new Map<string, CoverageRow[]>();
    for (const r of rows) if (r.faculty_id) {
      if (!map.has(r.faculty_id)) map.set(r.faculty_id, []);
      map.get(r.faculty_id)!.push(r);
    }
    let total = 0, behind = 0;
    for (const [, fr] of map) {
      total++;
      const isBehind = fr.some((r) => {
        const s = deriveCellState({
          total_students: r.total_students,
          marked_count: r.marked_count,
          absent_count: r.absent_count,
        });
        return s !== 'mostly-done';
      });
      if (isBehind) behind++;
    }
    return { total, behind };
  })();

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-2">
            <Link href="/admin/coverage" className="text-sm opacity-75 hover:opacity-100">&larr; Coverage</Link>
            <button onClick={() => signOut()} className="text-xs opacity-75 hover:opacity-100 underline">Sign Out</button>
          </div>
          <h1 className="text-2xl font-bold">Faculty Status</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-3">
          {config && Object.keys(config.day_dates).map((dayKey) => (
            <button
              key={dayKey}
              onClick={() => setSelectedDay(dayKey)}
              className={`flex-1 py-3 rounded-lg font-bold text-lg ${
                dayKey === selectedDay ? 'bg-camp-green text-white shadow-md'
                                       : 'bg-white text-camp-green border-2 border-camp-green'
              }`}
              aria-label={formatDayLabel(dayKey)}
            >
              {dayKey}
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-gray-700">
            <span className="font-bold">{facultyTotals.total - facultyTotals.behind}</span> /{' '}
            <span className="font-bold">{facultyTotals.total}</span> caught up
            {' · '}
            <span className="font-bold text-red-600">{facultyTotals.behind}</span> behind
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyBehind} onChange={(e) => setOnlyBehind(e.target.checked)} />
            Show only behind
          </label>
        </div>

        <FacultyGrid rows={rows} onlyBehind={onlyBehind} onCellClick={() => { /* session-detail modal wired in a follow-up PR */ }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test in browser**

Open: `http://localhost:3000/admin/faculty-status`
Expected: Grid renders with faculty rows × period columns; "show only behind" toggle hides caught-up rows.

- [ ] **Step 4: Commit**

```bash
git add app/admin/faculty-status/
git commit -m "feat(admin): /admin/faculty-status faculty x periods rollup

Live grid with 'show only behind' filter, summary chips for caught
up / behind counts. Reuses CoverageRow + deriveCellState.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Update admin nav (Coverage default)

**Files:**
- Modify: `app/admin/dashboard/page.tsx` (footer quick-links)
- Modify: `app/admin/page.tsx` (post-login redirect)

- [ ] **Step 1: Redirect post-login to `/admin/coverage`**

In `app/admin/page.tsx`, two places redirect on successful login (one in `useEffect`, one in `handleGoogleSignIn`). Change both `router.push('/admin/dashboard')` to `router.push('/admin/coverage')`.

- [ ] **Step 2: Add Coverage + Faculty Status to dashboard footer links**

In `app/admin/dashboard/page.tsx` around lines 638–654, prepend two more `<Link>` items inside the same grid:

```tsx
<Link href="/admin/coverage" className="camp-btn-outline block text-center py-3 font-semibold">
  Coverage
</Link>
<Link href="/admin/faculty-status" className="camp-btn-outline block text-center py-3 font-semibold">
  Faculty Status
</Link>
```

Bump the grid's column count if needed: `md:grid-cols-7`.

- [ ] **Step 3: Smoke-test**

Run: `npm run dev`
Sign out and back in via Google → should land at `/admin/coverage`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx app/admin/dashboard/page.tsx
git commit -m "feat(admin): land on /admin/coverage post-login + add nav links

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Tardy data migration script

**Files:**
- Create: `scripts/migrate-remove-tardy.mjs`

- [ ] **Step 1: Write the script**

`scripts/migrate-remove-tardy.mjs`:

```js
#!/usr/bin/env node
// One-shot: convert attendance docs with status='tardy' to status='present'.
//
// Usage:
//   node scripts/migrate-remove-tardy.mjs           # dry run (counts only)
//   node scripts/migrate-remove-tardy.mjs --apply   # write changes

import 'dotenv/config';
import admin from 'firebase-admin';
import { config } from 'dotenv';
config({ path: '.env.local' });

const apply = process.argv.includes('--apply');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FB_PROJECT_ID,
    clientEmail: process.env.FB_CLIENT_EMAIL,
    privateKey: process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('attendance').where('status', '==', 'tardy').get();
  console.log(`Found ${snap.size} attendance docs with status='tardy'.`);

  if (!apply) {
    for (const doc of snap.docs.slice(0, 10)) {
      console.log('  sample:', doc.id, doc.data());
    }
    console.log('Dry run only. Pass --apply to commit changes.');
    return;
  }

  let batchCount = 0;
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: 'present' });
    batchCount++;
    if (batchCount % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (batchCount % 400 !== 0) await batch.commit();
  console.log(`Updated ${batchCount} docs to status='present'.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run the script**

Run: `PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" node scripts/migrate-remove-tardy.mjs`
Expected: prints count + 10 samples, no writes.

- [ ] **Step 3: Commit the script (do NOT apply yet)**

```bash
git add scripts/migrate-remove-tardy.mjs
git commit -m "chore(migration): one-shot tardy -> present converter

Run with --apply after deploying the tardy-removal code. Defaults
to dry-run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: End-to-end verification + deploy

**Files:**
- (No code changes)

- [ ] **Step 1: Full test suite**

Run: `PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" npm test`
Expected: all unit tests pass.

- [ ] **Step 2: Typecheck + lint**

Run: `PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 3: Push branch and open PR (or merge to main)**

```bash
PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" git push -u origin feat/admin-coverage-dashboard
# Then open PR via gh pr create OR merge locally:
git checkout main && git merge --no-ff feat/admin-coverage-dashboard
PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" git push origin main
```

- [ ] **Step 4: Deploy**

```bash
PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" firebase deploy --only hosting
```

Expected: `Deploy complete!` + `Hosting URL: https://ttuboc-attendance.web.app`.

- [ ] **Step 5: Run the migration against prod**

```bash
PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" node scripts/migrate-remove-tardy.mjs --apply
```

Expected: prints `Updated N docs to status='present'.`

- [ ] **Step 6: Sanity-check live**

Open: `https://ttuboc-attendance.web.app/admin/coverage`
Verify: page loads, colors map to sessions, filters work. Spot-check `/admin/faculty-status`. Spot-check `/admin/dashboard` (should still show absences only).

---

## Self-review notes

- Spec coverage: every section of `2026-05-22-admin-attendance-dashboard-design.md` maps to a task above. Tardy removal (Tasks 1–8) → spec §"Tardy Removal". `lib/attendance-rules.ts` → Task 9. `getDayCoverage` → Task 10. API → Task 11. Coverage page + components → Task 12. Faculty status → Task 13. Nav → Task 14. Migration → Task 15. Deploy → Task 16.
- Type consistency: `CoverageRow` defined in Task 10 is referenced by name in Tasks 11, 12, 13. `CellState` defined in Task 9 is referenced in Task 12. `deriveCellState` signature consistent.
- No placeholders: each step has executable code or exact commands.
- Bite-sized: each step is one action.
