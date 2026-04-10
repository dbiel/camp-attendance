# TTU Camp Attendance - Security & Data-Safety Track

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close all P0 data-exposure and privilege-escalation holes in the TTU Camp Attendance app and add defense-in-depth before the ~644-minor dataset is exposed to the public internet.

**Architecture:** The app is Next.js 14 App Router on Firestore. Two auth modes: admin (Firebase Auth ID token on `Authorization: Bearer`) and teacher (shared `X-Camp-Code` header). All DB writes go through server routes using `firebase-admin`; the client SDK has direct read on `attendance` via Firestore rules. This track tightens auth per-route, adds rate limiting, sanitizes payloads, removes denormalized PII from `attendance`, and hardens `firestore.rules`.

**Tech Stack:** Next 14 App Router, firebase-admin (server), firebase (client), TypeScript, Vitest (unit + integration), `@firebase/rules-unit-testing`.

**Prerequisites / deferred:**
- Integration tests against real Firestore need `TEST_ADMIN_TOKEN` and emulator config — the **code-health track owns the harness fix**. This plan uses unit tests (mocked `firebase-admin`) wherever possible. Where an integration test is the only way, the test is marked `it.skip` with a comment pointing at the emulator setup doc; it becomes live once code-health lands.
- Code-health track is adding `withAuth()` wrapper + `export const dynamic = 'force-dynamic'` to the same 17 routes. **This plan writes fixes against the current per-route pattern** so it is not blocked. A final Task (12) rebases onto `withAuth()` if it lands first; otherwise code-health rebases onto our fixes (both sides change the same lines, so one merge pass is unavoidable).

---

## Dependency Graph (within the track)

- Task 1 (camp code rotation) is a prerequisite for Tasks 2–5 because every later test uses the new `CAMP_CODE` env variable and the timing-safe compare.
- Task 2 (rate limiter lib) blocks Task 5 (apply rate limiter to routes).
- Task 3 (teacher-safe faculty projection) and Task 4 (teacher-safe session students + dorm_room stripping) both touch `lib/firestore.ts` — keep them sequential to avoid merge churn in one file, OR split the projection helpers into `lib/projections.ts` (the plan does this).
- Task 6 (attendance POST validation) and Task 7 (attendance GET per-teacher scoping) both edit `app/api/attendance/route.ts` — sequential.
- Task 8 (de-denormalize parent PII) refactors `markAttendance` and changes the shape of `AttendanceDenormalized`; it **must come after** Tasks 6–7 or the tests Task 6 writes break when the shape changes.
- Task 9 (firestore.rules hardening) is independent; run in parallel.
- Task 10 (kill cookie writer + delete /api/admin/login) is independent; run in parallel.
- Task 11 (fail-fast env) is independent; run in parallel.
- Task 12 (reconcile with withAuth() wrapper) is last, conditional.

## Parallelization opportunities within the track

Fan-out-safe groups (can be split across subagents once Task 1 lands):
- **Group A:** Tasks 2, 9, 10, 11 — all touch disjoint files after Task 1 commits.
- **Group B (sequential inside, parallel to A):** Task 3 → Task 4 → Tasks 6/7 → Task 8. These share `lib/firestore.ts` / `app/api/attendance/route.ts` and must serialize.
- **Task 5** depends on Task 2 + Task 1; run after both.
- **Task 12** runs last.

Estimated wall-clock with 2 subagents: ~4–5 hours. Serial: ~8 hours.

## Cross-cluster dependencies

1. **UX track is editing `app/api/attendance/route.ts`** (adding retry/batching wrapper around POST). This plan also edits that file in Tasks 6 + 7 + 8. **Merge strategy:** security track goes first because (a) our changes are shape-breaking (whitelist, server-derived `marked_by`, no denormalized parent fields) and the UX retry logic must be written against the final request/response contract, and (b) our changes are a strict prerequisite for the app being deployable at all. Concretely: complete Tasks 6–8, merge, then notify UX. If UX has already drafted their retry code, they must rebase and re-point the request body to the new whitelisted shape (remove `marked_by` from the client body).
2. **Code-health track is adding `withAuth()` wrapper** in `lib/auth.ts` (or a new `lib/with-auth.ts`) that folds `getCallerRole` + 401/403 handling. We leave current per-route `getCallerRole(request)` calls in place. Task 12 adapts to whichever wrapper shape lands; if code-health has not landed `withAuth()` by the time this track is done, Task 12 is a no-op and code-health rebases onto us. Either way, exactly one side will do a mechanical rename pass across 17 files. Coordinate via `TOUCHED_FILES` index at bottom.
3. **Code-health track will add `export const dynamic = 'force-dynamic'`** to the same 17 route files. This is an additive single-line change at the top of each file; conflict risk is mechanical only. Whoever goes second does the merge. Flag in handoff.
4. **Code-health track wants to delete `middleware.ts`.** We do **not** add CSP/HSTS headers here to avoid stepping on them. Deferred to code-health; they own the decision of where headers live (`next.config.js` headers() vs middleware).

---

### Task 1: Rotate camp code, timing-safe compare, remove literal fallbacks

**Files:**
- Modify: `lib/auth.ts:28-43`
- Modify: `scripts/anonymize-and-seed.js:283`
- Modify: `scripts/seed-remaining-attendance.js:140`
- Modify: `tests/unit/lib/auth.test.ts` (add timing-safe cases)
- Modify: `tests/setup/vitest.setup.ts` (already sets `CAMP_CODE=test-camp-2026`; keep)

**Effort:** M

- [ ] **Step 1: Write failing test asserting timing-safe equality rejects short codes without throwing**

Append to `tests/unit/lib/auth.test.ts` inside `describe('verifyTeacher', ...)`:

```typescript
  it('returns false (does not throw) when provided code is shorter than expected', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'x' }));
    expect(result).toBe(false);
  });

  it('returns false (does not throw) when provided code is longer than expected', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'test-camp-2026-extra-junk' }));
    expect(result).toBe(false);
  });
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run tests/unit/lib/auth.test.ts -t "shorter than expected"`
Expected: test passes incidentally (plain `===` returns false) — so change the expectation. Replace with a spy that asserts `timingSafeEqual` is called. Use this version instead:

```typescript
  it('uses timingSafeEqual for comparison', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);
    const crypto = await import('node:crypto');
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    await verifyTeacher(makeRequest({ 'X-Camp-Code': 'test-camp-2026' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
```

Run again. Expected: FAIL — `timingSafeEqual` not called because `lib/auth.ts` uses `===`.

- [ ] **Step 3: Replace `verifyTeacher` with timing-safe compare**

Edit `lib/auth.ts`:

```typescript
import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb } from './firebase-admin';

export type CallerRole = 'admin' | 'teacher' | null;

function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still do a constant-time comparison of equal-length buffers to keep timing flat.
    const pad = Buffer.alloc(ab.length);
    timingSafeEqual(ab, pad);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

export async function verifyTeacher(request: NextRequest): Promise<boolean> {
  const campCode = request.headers.get('X-Camp-Code');
  if (!campCode) return false;

  let expected: string | undefined;
  try {
    const configDoc = await adminDb.collection('config').doc('camp').get();
    expected = configDoc.exists ? configDoc.data()?.camp_code : process.env.CAMP_CODE;
  } catch {
    expected = process.env.CAMP_CODE;
  }
  return safeEqual(campCode, expected);
}

export async function getCallerRole(request: NextRequest): Promise<CallerRole> {
  const admin = await verifyAdmin(request);
  if (admin) return 'admin';
  const isTeacher = await verifyTeacher(request);
  if (isTeacher) return 'teacher';
  return null;
}
```

- [ ] **Step 4: Run auth unit tests**

Run: `npx vitest run tests/unit/lib/auth.test.ts`
Expected: PASS (all cases, including new `timingSafeEqual` spy case).

- [ ] **Step 5: Remove `'camp2026'` literal fallback in seed scripts**

Edit `scripts/anonymize-and-seed.js` line ~283:

```javascript
  const campCode = process.env.CAMP_CODE;
  if (!campCode) {
    console.error('ERROR: CAMP_CODE env var is required. Aborting seed.');
    process.exit(1);
  }
  await db.collection('config').doc('camp').set({
    camp_code: campCode,
    camp_year: 2026,
    day_dates: {
      Monday: '2026-06-08',
      Tuesday: '2026-06-09',
      Wednesday: '2026-06-10',
      Thursday: '2026-06-11',
      Friday: '2026-06-12',
      Saturday: '2026-06-13',
    },
  });
```

Apply the same pattern (early `process.exit(1)` if missing) to `scripts/seed-remaining-attendance.js:140`.

- [ ] **Step 6: Smoke-check with no env var**

Run: `CAMP_CODE='' node scripts/anonymize-and-seed.js --dry-run 2>&1 | head -5`
Expected: exits non-zero with "CAMP_CODE env var is required".
(If no `--dry-run` flag exists, just invoke and kill after the error prints.)

- [ ] **Step 7: Commit**

```bash
git add lib/auth.ts scripts/anonymize-and-seed.js scripts/seed-remaining-attendance.js tests/unit/lib/auth.test.ts
git commit -m "security: timing-safe camp code compare, remove literal fallbacks"
```

---

### Task 2: In-memory per-IP rate limiter library

**Files:**
- Create: `lib/rate-limit.ts`
- Create: `tests/unit/lib/rate-limit.test.ts`

**Effort:** M

Per-IP token bucket, 5 hits per 60-second window. In-memory Map keyed by IP. This is a best-effort single-instance limiter — acceptable for the expected deployment (single Next.js instance). Document the limitation.

- [ ] **Step 1: Write failing test — allows 5, blocks 6th, resets after window**

Create `tests/unit/lib/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkRateLimit, _resetRateLimitForTests } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows 5 requests in 60s from same IP', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('1.2.3.4')).toBe(true);
    }
  });

  it('blocks the 6th request within 60s', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4')).toBe(false);
  });

  it('is isolated per IP', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('5.6.7.8')).toBe(true);
  });

  it('resets after the window passes', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4')).toBe(false);
    vi.setSystemTime(new Date('2026-06-08T10:01:01Z'));
    expect(checkRateLimit('1.2.3.4')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run tests/unit/lib/rate-limit.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement minimal rate limiter**

Create `lib/rate-limit.ts`:

```typescript
import { NextRequest } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_HITS = 5;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_HITS) return false;
  b.count += 1;
  return true;
}

export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export function _resetRateLimitForTests(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `npx vitest run tests/unit/lib/rate-limit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts tests/unit/lib/rate-limit.test.ts
git commit -m "security: add per-IP rate limiter lib (5/min window)"
```

---

### Task 3: Teacher-safe projection helpers + lock down `/api/faculty` GET

**Files:**
- Create: `lib/projections.ts`
- Create: `tests/unit/lib/projections.test.ts`
- Modify: `app/api/faculty/route.ts`
- Modify: `app/api/faculty/[id]/route.ts`

**Effort:** M

- [ ] **Step 1: Write failing test for `facultyForTeacher` projection**

Create `tests/unit/lib/projections.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { facultyForTeacher } from '@/lib/projections';

describe('facultyForTeacher', () => {
  it('strips email from faculty records', () => {
    const input = [
      { id: 'f1', first_name: 'A', last_name: 'B', role: 'Director', email: 'a@b.com', created_at: '2026-01-01' },
    ];
    const out = facultyForTeacher(input as any);
    expect(out[0]).not.toHaveProperty('email');
    expect(out[0]).toEqual({
      id: 'f1', first_name: 'A', last_name: 'B', role: 'Director',
    });
  });

  it('handles missing email field gracefully', () => {
    const out = facultyForTeacher([
      { id: 'f2', first_name: 'C', last_name: 'D', role: 'Staff', created_at: '2026-01-01' } as any,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('email');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run tests/unit/lib/projections.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/projections.ts`**

Create `lib/projections.ts`:

```typescript
import type { Faculty, SessionStudentDenormalized } from './types';

export type FacultyTeacherView = Pick<Faculty, 'id' | 'first_name' | 'last_name' | 'role'>;

export function facultyForTeacher(list: Faculty[]): FacultyTeacherView[] {
  return list.map(({ id, first_name, last_name, role }) => ({ id, first_name, last_name, role }));
}

export type SessionStudentTeacherView = Omit<SessionStudentDenormalized, 'dorm_room'>;

export function sessionStudentsForTeacher(list: SessionStudentDenormalized[]): SessionStudentTeacherView[] {
  return list.map(({ dorm_room, ...rest }) => rest);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run tests/unit/lib/projections.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate faculty GET behind `getCallerRole` and apply projection**

Edit `app/api/faculty/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getFaculty, createFaculty } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { facultyForTeacher } from '@/lib/projections';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`faculty-get:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const faculty = await getFaculty();
    if (role === 'teacher') {
      return NextResponse.json(facultyForTeacher(faculty));
    }
    return NextResponse.json(faculty);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    return NextResponse.json({ error: 'Failed to fetch faculty' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const data = await request.json();
    const id = await createFaculty(data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Error creating faculty:', error);
    return NextResponse.json({ error: 'Failed to create faculty' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Apply same gate + projection to `/api/faculty/[id]` GET**

Edit `app/api/faculty/[id]/route.ts` — replace the public GET:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const faculty = await getFacultyMember(params.id);
    if (!faculty) {
      return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });
    }
    if (role === 'teacher') {
      const { id, first_name, last_name, role: facRole } = faculty;
      return NextResponse.json({ id, first_name, last_name, role: facRole });
    }
    return NextResponse.json(faculty);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    return NextResponse.json({ error: 'Failed to fetch faculty' }, { status: 500 });
  }
}
```

- [ ] **Step 7: Update `app/page.tsx` teacher landing to fetch only after camp code is set**

`app/page.tsx:17-25` already guards behind `getCampCode()`, but `fetchFaculty` does not send the header. Edit the fetch:

```typescript
  async function fetchFaculty() {
    try {
      const { getCampCodeHeaders } = await import('@/lib/camp-code');
      const res = await fetch('/api/faculty', { headers: { ...getCampCodeHeaders() } });
      if (res.status === 401) {
        const { clearCampCode } = await import('@/lib/camp-code');
        clearCampCode();
        setHasCode(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setFaculty(data);
      setFiltered(data);
    } catch (error) {
      console.error('Error fetching faculty:', error);
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 8: Run projection + auth tests**

Run: `npx vitest run tests/unit/lib/projections.test.ts tests/unit/lib/auth.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/projections.ts tests/unit/lib/projections.test.ts app/api/faculty/route.ts app/api/faculty/[id]/route.ts app/page.tsx
git commit -m "security: gate /api/faculty behind camp code, strip emails for teachers"
```

---

### Task 4: Strip `dorm_room` from teacher session-students payload

**Files:**
- Modify: `app/api/sessions/[id]/students/route.ts`
- Modify: `tests/unit/lib/projections.test.ts` (add test for `sessionStudentsForTeacher`)

**Effort:** S

- [ ] **Step 1: Add failing test for dorm_room stripping**

Append to `tests/unit/lib/projections.test.ts`:

```typescript
import { sessionStudentsForTeacher } from '@/lib/projections';

describe('sessionStudentsForTeacher', () => {
  it('strips dorm_room from session student records', () => {
    const input = [{
      id: 'ss1', session_id: 's1', student_id: 'st1',
      first_name: 'Jane', last_initial: 'D', instrument: 'Flute',
      ensemble: 'Wind', dorm_room: 'Hall-204',
    }];
    const out = sessionStudentsForTeacher(input as any);
    expect(out[0]).not.toHaveProperty('dorm_room');
    expect(out[0].first_name).toBe('Jane');
  });
});
```

- [ ] **Step 2: Run, expect PASS** (helper already exists from Task 3)

Run: `npx vitest run tests/unit/lib/projections.test.ts`
Expected: PASS.

- [ ] **Step 3: Apply projection in the teacher branch**

Edit `app/api/sessions/[id]/students/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionStudentsFull, getSessionStudents } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { sessionStudentsForTeacher } from '@/lib/projections';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (role === 'teacher') {
      const students = await getSessionStudents(params.id);
      return NextResponse.json(sessionStudentsForTeacher(students));
    }

    const students = await getSessionStudentsFull(params.id);
    return NextResponse.json(students);
  } catch (error) {
    console.error('Error fetching session students:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/sessions/[id]/students/route.ts tests/unit/lib/projections.test.ts
git commit -m "security: strip dorm_room from teacher session roster"
```

---

### Task 5: Wire rate limiter into every camp-code-checking route

**Files:**
- Modify: all 17 routes under `app/api/**` that call `getCallerRole`. Focus on the teacher-reachable ones; admin-only routes still benefit from limiting on unauth attempts.

**Effort:** M

Apply a uniform pattern: **rate limit only unauthenticated attempts** (to avoid penalizing real teachers holding the code) by keying on IP + route path and only incrementing when `getCallerRole` returns `null`.

- [ ] **Step 1: Write integration-style unit test covering the rate-limit branch**

Create `tests/unit/lib/rate-limit-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn().mockRejectedValue(new Error('no token')) },
  adminDb: {
    collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
  },
}));

import { _resetRateLimitForTests } from '@/lib/rate-limit';
import { GET as facultyGet } from '@/app/api/faculty/route';

describe('rate limiter wired into /api/faculty', () => {
  beforeEach(() => _resetRateLimitForTests());

  it('returns 429 after 5 unauthenticated attempts from the same IP', async () => {
    const make = () => new NextRequest('http://localhost/api/faculty', {
      headers: new Headers({ 'x-forwarded-for': '9.9.9.9' }),
    });
    for (let i = 0; i < 5; i++) {
      const r = await facultyGet(make());
      expect([401, 429]).toContain(r.status);
    }
    const r = await facultyGet(make());
    expect(r.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run tests/unit/lib/rate-limit-integration.test.ts`
Expected: FAIL — current faculty route does not return 429.

- [ ] **Step 3: Re-run, expect PASS**

Run: `npx vitest run tests/unit/lib/rate-limit-integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Apply the same unauth-only gate to all other 16 routes listed in the Touched Files index**

For each route file, add near the top of every exported handler, after `getCallerRole(request)`:

```typescript
    const role = await getCallerRole(request);
    if (!role) {
      const ip = getClientIp(request);
      if (!checkRateLimit(`<route-key>:${ip}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
```

Use distinct keys per route (e.g. `attendance-get`, `attendance-post`, `sessions-get`, etc.) so an authorized teacher hitting `/api/attendance` 100 times doesn't lock out a different unauth attacker on `/api/sessions`.

Import block for each modified route:

```typescript
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
```

- [ ] **Step 5: Run entire unit suite**

Run: `npx vitest run tests/unit/`
Expected: PASS (all green).

- [ ] **Step 6: Commit**

```bash
git add app/api lib/rate-limit.ts tests/unit/lib/rate-limit-integration.test.ts
git commit -m "security: per-IP rate limit unauthenticated API attempts (5/min)"
```

---

### Task 6: Whitelist attendance status + derive `marked_by` server-side

**Files:**
- Modify: `app/api/attendance/route.ts`
- Modify: `lib/firestore.ts` (`markAttendance` signature — keep `markedBy` optional param but treat it as authoritative identity input, not caller-supplied)
- Create: `tests/unit/api/attendance-post.test.ts`

**Effort:** M

- [ ] **Step 1: Write failing unit tests**

Create `tests/unit/api/attendance-post.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const markAttendanceMock = vi.fn();
vi.mock('@/lib/firestore', () => ({
  markAttendance: markAttendanceMock,
  getSessionAttendance: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn().mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' }) },
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
}));

import { POST } from '@/app/api/attendance/route';

function post(body: any, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/attendance', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/attendance', () => {
  beforeEach(() => markAttendanceMock.mockReset());

  it('rejects invalid status', async () => {
    const res = await POST(post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'hacked' }));
    expect(res.status).toBe(400);
    expect(markAttendanceMock).not.toHaveBeenCalled();
  });

  it('accepts present/absent/tardy', async () => {
    for (const status of ['present', 'absent', 'tardy']) {
      markAttendanceMock.mockResolvedValue(undefined);
      const res = await POST(post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status }));
      expect(res.status).toBe(200);
    }
  });

  it('ignores client-supplied marked_by and derives from caller identity', async () => {
    markAttendanceMock.mockResolvedValue(undefined);
    await POST(post({
      student_id: 's1', session_id: 'sess1', date: '2026-06-08',
      status: 'present', marked_by: 'SPOOFED-UID',
    }));
    const call = markAttendanceMock.mock.calls[0];
    expect(call[4]).not.toBe('SPOOFED-UID');
    expect(call[4]).toMatch(/admin:admin-1/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run tests/unit/api/attendance-post.test.ts`
Expected: FAIL (status validation missing; `marked_by` trusted).

- [ ] **Step 3: Implement route changes**

Edit `app/api/attendance/route.ts` POST handler:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { markAttendance, getSessionAttendance } from '@/lib/firestore';
import { getCallerRole, verifyAdmin, verifyTeacher } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const ALLOWED_STATUSES = new Set(['present', 'absent', 'tardy'] as const);
type AttendanceStatus = 'present' | 'absent' | 'tardy';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    const isTeacher = admin ? false : await verifyTeacher(request);
    if (!admin && !isTeacher) {
      const ip = getClientIp(request);
      if (!checkRateLimit(`attendance-post:${ip}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { student_id, session_id, date, status } = body ?? {};

    if (!student_id || !session_id || !date || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status as AttendanceStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const markedBy = admin
      ? `admin:${admin.uid}`
      : `teacher:${getClientIp(request)}`;

    await markAttendance(
      String(student_id),
      String(session_id),
      String(date),
      status as AttendanceStatus,
      markedBy,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return NextResponse.json({ error: 'Failed to mark attendance' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run tests/unit/api/attendance-post.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/attendance/route.ts tests/unit/api/attendance-post.test.ts
git commit -m "security: whitelist attendance status, derive marked_by server-side"
```

**Cross-cluster note:** After this commit, notify the UX track. Their retry/batching code must drop `marked_by` from the POST body; it will be silently ignored otherwise. Request shape is now strictly `{ student_id, session_id, date, status }`.

---

### Task 7: Per-teacher session scoping for attendance GET

**Files:**
- Modify: `lib/auth.ts` (add `getCallerFacultyId(request)` helper that looks up faculty by `X-Faculty-Id` header under teacher role)
- Modify: `app/api/attendance/route.ts` GET
- Modify: `lib/firestore.ts` (add `isFacultyAssignedToSession(facultyId, sessionId)`)
- Create: `tests/unit/api/attendance-get.test.ts`

**Effort:** M

The teacher app already knows `facultyId` (teacher selects their name on the landing page then routes to `/teacher/{facultyId}`). Send it alongside `X-Camp-Code` and scope reads to sessions where `session.faculty_id === facultyId`.

- [ ] **Step 1: Failing test for scoping**

Create `tests/unit/api/attendance-get.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firestore', () => ({
  getSessionAttendance: vi.fn().mockResolvedValue([]),
  isFacultyAssignedToSession: vi.fn(),
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn().mockRejectedValue(new Error('no token')) },
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({
    exists: true, data: () => ({ camp_code: 'test-camp-2026' }),
  }) }) }) },
}));

import { GET } from '@/app/api/attendance/route';
import { isFacultyAssignedToSession } from '@/lib/firestore';

function get(sessionId: string, facultyId?: string) {
  const h: Record<string, string> = {
    'X-Camp-Code': 'test-camp-2026',
    'x-forwarded-for': '1.1.1.1',
  };
  if (facultyId) h['X-Faculty-Id'] = facultyId;
  return new NextRequest(`http://localhost/api/attendance?session_id=${sessionId}&date=2026-06-08`, {
    headers: new Headers(h),
  });
}

describe('GET /api/attendance scoping', () => {
  beforeEach(() => vi.mocked(isFacultyAssignedToSession).mockReset());

  it('rejects teachers without X-Faculty-Id', async () => {
    const res = await GET(get('sess1'));
    expect(res.status).toBe(403);
  });

  it('rejects when faculty is not assigned to that session', async () => {
    vi.mocked(isFacultyAssignedToSession).mockResolvedValue(false);
    const res = await GET(get('sess1', 'fac-other'));
    expect(res.status).toBe(403);
  });

  it('allows when faculty is assigned', async () => {
    vi.mocked(isFacultyAssignedToSession).mockResolvedValue(true);
    const res = await GET(get('sess1', 'fac-ok'));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run tests/unit/api/attendance-get.test.ts`
Expected: FAIL (scoping not implemented, `isFacultyAssignedToSession` undefined).

- [ ] **Step 3: Add helper in `lib/firestore.ts`**

Append to `lib/firestore.ts`:

```typescript
export async function isFacultyAssignedToSession(facultyId: string, sessionId: string): Promise<boolean> {
  const doc = await sessionsCol().doc(sessionId).get();
  if (!doc.exists) return false;
  return doc.data()?.faculty_id === facultyId;
}
```

- [ ] **Step 4: Update `app/api/attendance/route.ts` GET**

Replace the GET handler:

```typescript
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    const isTeacher = admin ? false : await verifyTeacher(request);
    if (!admin && !isTeacher) {
      const ip = getClientIp(request);
      if (!checkRateLimit(`attendance-get:${ip}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const date = searchParams.get('date');
    if (!sessionId || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters: session_id, date' },
        { status: 400 },
      );
    }

    if (!admin) {
      const facultyId = request.headers.get('X-Faculty-Id');
      if (!facultyId) {
        return NextResponse.json({ error: 'Missing X-Faculty-Id' }, { status: 403 });
      }
      const { isFacultyAssignedToSession } = await import('@/lib/firestore');
      const assigned = await isFacultyAssignedToSession(facultyId, sessionId);
      if (!assigned) {
        return NextResponse.json({ error: 'Not assigned to this session' }, { status: 403 });
      }
    }

    const attendance = await getSessionAttendance(sessionId, date);

    if (!admin) {
      const sanitized = attendance.map(a => ({
        id: a.id,
        student_id: a.student_id,
        session_id: a.session_id,
        date: a.date,
        status: a.status,
        marked_at: a.marked_at,
      }));
      return NextResponse.json(sanitized);
    }
    return NextResponse.json(attendance);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Update the teacher client to send `X-Faculty-Id`**

Edit `lib/camp-code.ts` to add a teacher-context helper:

```typescript
const FACULTY_ID_KEY = 'faculty_id';

export function setTeacherFacultyId(id: string): void {
  localStorage.setItem(FACULTY_ID_KEY, id);
}
export function getTeacherFacultyId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FACULTY_ID_KEY);
}
export function clearTeacherFacultyId(): void {
  localStorage.removeItem(FACULTY_ID_KEY);
}

export function getCampCodeHeaders(): Record<string, string> {
  const code = getCampCode();
  const facultyId = getTeacherFacultyId();
  const h: Record<string, string> = {};
  if (code) h['X-Camp-Code'] = code;
  if (facultyId) h['X-Faculty-Id'] = facultyId;
  return h;
}
```

Then find the teacher page that selects a faculty member (`app/teacher/[facultyId]/*`) and call `setTeacherFacultyId(params.facultyId)` on mount; call `clearTeacherFacultyId()` on logout/clear.

- [ ] **Step 6: Run all unit tests**

Run: `npx vitest run tests/unit/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/attendance/route.ts lib/firestore.ts lib/camp-code.ts app/teacher tests/unit/api/attendance-get.test.ts
git commit -m "security: scope teacher attendance reads to their assigned sessions"
```

---

### Task 8: Remove parent PII denormalization from attendance docs

**Files:**
- Modify: `lib/firestore.ts` (`markAttendance`, `getAttendanceReport`)
- Modify: `lib/types.ts` (shrink `AttendanceDenormalized`)
- Modify: `app/api/attendance/report/route.ts` (server-side join)
- Modify: `tests/unit/lib/firestore.test.ts`

**Effort:** L

Goal: parent contact info (`email`, `cell_phone`, `parent_first_name`, `parent_last_name`, `parent_phone`) and `dorm_building` / `dorm_room` no longer live on attendance docs. Admin dashboard joins in the API handler from `students/{id}`. Since `firestore.rules` already says `match /students/{studentId}` is `if false`, students are already admin-SDK-only — this closes the hole where a compromised admin client session could dump parent contact info from attendance via the real-time listener.

- [ ] **Step 1: Write a failing unit test against `markAttendance`**

Append to `tests/unit/lib/firestore.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => {
  const setMock = vi.fn().mockResolvedValue(undefined);
  const getStudentDoc = {
    exists: true,
    data: () => ({
      first_name: 'J', last_name: 'D', last_initial: 'D',
      instrument: 'Cello', ensemble: 'Orch',
      parent_phone: '555-1212', parent_first_name: 'P', parent_last_name: 'D',
      email: 'leak@example.com', cell_phone: '555-0000',
      dorm_building: 'North', dorm_room: '204',
    }),
  };
  const getSessionDoc = { exists: true, data: () => ({ name: 'Rehearsal', period_id: 'p1' }) };
  const getPeriodDoc = { exists: true, data: () => ({ number: 1, name: 'Morning' }) };

  const collection = (name: string) => ({
    doc: (_id?: string) => ({
      get: async () => {
        if (name === 'students') return getStudentDoc;
        if (name === 'sessions') return getSessionDoc;
        if (name === 'periods') return getPeriodDoc;
        return { exists: false };
      },
      set: setMock,
      update: vi.fn(),
    }),
    where: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }),
    get: async () => ({ docs: [], empty: true, size: 0 }),
    orderBy: () => ({ get: async () => ({ docs: [] }) }),
    add: vi.fn(),
  });

  return {
    adminDb: { collection },
    __setMock: setMock,
  };
});

import { markAttendance } from '@/lib/firestore';

describe('markAttendance PII stripping', () => {
  it('does not write parent/contact fields onto attendance doc', async () => {
    const mod = await import('@/lib/firebase-admin');
    const setMock = (mod as any).__setMock;
    setMock.mockClear();

    await markAttendance('st1', 'sess1', '2026-06-08', 'present', 'admin:u1');

    expect(setMock).toHaveBeenCalledTimes(1);
    const written = setMock.mock.calls[0][0];
    for (const field of [
      'parent_phone', 'parent_first_name', 'parent_last_name',
      'email', 'cell_phone', 'dorm_building', 'dorm_room',
    ]) {
      expect(written[field]).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run tests/unit/lib/firestore.test.ts`
Expected: FAIL — current `markAttendance` writes all those fields.

- [ ] **Step 3: Trim denormalized fields from `markAttendance`**

Edit `lib/firestore.ts`, replace the `attendanceCol().doc(docId).set(...)` payload:

```typescript
  await attendanceCol().doc(docId).set({
    student_id: studentId,
    session_id: sessionId,
    date,
    status,
    marked_at: new Date().toISOString(),
    marked_by: markedBy || null,
    first_name: student.first_name,
    last_name: student.last_name,
    last_initial: student.last_initial,
    preferred_name: student.preferred_name || null,
    instrument: student.instrument,
    ensemble: student.ensemble,
    session_name: session.name,
    period_number: period?.number ?? 0,
    period_name: period?.name ?? '',
    teacher_name: teacherName,
  } satisfies Omit<AttendanceDenormalized, 'id'>);
```

- [ ] **Step 4: Shrink `AttendanceDenormalized` type in `lib/types.ts`**

Remove the five parent-contact fields and the two dorm fields from the interface:

```typescript
export interface AttendanceDenormalized {
  id: string;
  student_id: string;
  session_id: string;
  date: string;
  status: 'present' | 'absent' | 'tardy';
  marked_at: string;
  marked_by?: string;
  first_name: string;
  last_name: string;
  last_initial: string;
  preferred_name?: string;
  instrument: string;
  ensemble: string;
  session_name: string;
  period_number: number;
  period_name: string;
  teacher_name: string;
}
```

- [ ] **Step 5: Fix `getAttendanceReport` to join from `students/{id}` for admin-only parent fields**

Replace body:

```typescript
export async function getAttendanceReport(date: string, status?: 'absent' | 'tardy'): Promise<AttendanceReport[]> {
  const snap = await attendanceCol().where('date', '==', date).get();
  const filteredDocs = status
    ? snap.docs.filter(doc => doc.data().status === status)
    : snap.docs.filter(doc => ['absent', 'tardy'].includes(doc.data().status));

  const results: AttendanceReport[] = [];
  for (const doc of filteredDocs) {
    const d = doc.data() as AttendanceDenormalized;
    const student = await getStudent(d.student_id);
    if (!student) continue;
    results.push({
      student_id: d.student_id,
      first_name: d.first_name,
      last_name: d.last_name,
      instrument: d.instrument,
      ensemble: d.ensemble,
      dorm_building: student.dorm_building,
      dorm_room: student.dorm_room,
      parent_phone: student.parent_phone,
      cell_phone: student.cell_phone,
      email: student.email,
      parent_first_name: student.parent_first_name,
      parent_last_name: student.parent_last_name,
      session_name: d.session_name,
      session_id: d.session_id,
      status: d.status as 'absent' | 'tardy',
      period_number: d.period_number,
      period_name: d.period_name,
      teacher_name: d.teacher_name,
      date: d.date,
    });
  }

  results.sort((a, b) => {
    if (a.period_number !== b.period_number) return a.period_number - b.period_number;
    if (a.ensemble !== b.ensemble) return (a.ensemble || '').localeCompare(b.ensemble || '');
    if (a.last_name !== b.last_name) return a.last_name.localeCompare(b.last_name);
    return a.first_name.localeCompare(b.first_name);
  });
  return results;
}
```

- [ ] **Step 6: Update the admin dashboard real-time listener path**

Grep for `.collection('attendance')` in `app/admin/**`. Any field it read from the old denormalized doc (parent_phone, email, cell_phone, dorm_*) must now come from a separate server call. Add a note in the admin component TODO to use `/api/attendance/report` (which already joins server-side) instead of the Firestore client listener. For this task, just delete the client reads of PII fields — do not refactor the whole listener. Acceptable temporary degradation: admin dashboard live view stops showing parent phone in the absent/tardy tile until the listener is replaced.

- [ ] **Step 7: Migration note for existing data**

Add a comment to the top of `lib/firestore.ts`:

```typescript
// NOTE: Existing attendance docs in production still carry denormalized parent/contact
// fields from prior schema. Run scripts/cleanup-attendance-pii.js before deploy to
// unset those fields. New writes (markAttendance) no longer include them.
```

Do NOT write the cleanup script in this task — that's a deploy-time migration. Flag it in the handoff as a required pre-deploy step.

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/unit/lib/firestore.test.ts`
Expected: PASS.

Run full unit suite: `npx vitest run tests/unit/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/firestore.ts lib/types.ts tests/unit/lib/firestore.test.ts
git commit -m "security: de-denormalize parent PII from attendance docs"
```

---

### Task 9: Firestore rules hardening — default-deny + tighten attendance read

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/security/firestore-rules.test.ts`

**Effort:** S

- [ ] **Step 1: Add failing test for default deny**

Append to `tests/security/firestore-rules.test.ts`:

```typescript
  describe('Default deny', () => {
    it('rejects unknown collection even for authenticated users', async () => {
      const db = testEnv.authenticatedContext('admin-uid').firestore();
      await assertFails(db.collection('secret_future_collection').doc('x').get());
    });
  });
```

- [ ] **Step 2: Run tests against emulator**

Run: `firebase emulators:exec --only firestore "npx vitest run tests/security/firestore-rules.test.ts"`
Expected: FAIL for the new case because no default deny exists.

- [ ] **Step 3: Add catch-all deny terminator to `firestore.rules`**

Append before the final closing `}`:

```
    match /{document=**} {
      allow read, write: if false;
    }
```

- [ ] **Step 4: Run emulator test, expect PASS**

Run: `firebase emulators:exec --only firestore "npx vitest run tests/security/firestore-rules.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/security/firestore-rules.test.ts
git commit -m "security: add default-deny terminator to firestore rules"
```

---

### Task 10: Delete dead cookie writer and `/api/admin/login`

**Files:**
- Modify: `lib/auth-context.tsx:26-50`
- Delete: `app/api/admin/login/route.ts`

**Effort:** S

- [ ] **Step 1: Remove cookie writer from `lib/auth-context.tsx`**

Replace the `useEffect` in `AuthProvider`:

```typescript
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
```

Remove the `document.cookie = ...` line from `signOut` too.

- [ ] **Step 2: Delete `/api/admin/login` route**

```bash
rm app/api/admin/login/route.ts
rmdir app/api/admin/login 2>/dev/null || true
```

- [ ] **Step 3: Grep for any remaining references**

Run: `grep -rn "firebase_auth_token\|api/admin/login" app lib tests middleware.ts 2>/dev/null`
Expected: no output.

- [ ] **Step 4: Run build to verify no dangling imports**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth-context.tsx app/api/admin/login
git commit -m "security: delete dead firebase_auth_token cookie + deprecated admin login"
```

---

### Task 11: Fail fast on missing Firebase env vars

**Files:**
- Modify: `lib/firebase.ts`
- Create: `tests/unit/lib/firebase-env.test.ts`

**Effort:** S

- [ ] **Step 1: Failing test — module throws when required env var missing**

Create `tests/unit/lib/firebase-env.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('firebase client config', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('throws when required public Firebase env vars are missing at runtime', async () => {
    const prev = process.env.NEXT_PHASE;
    delete process.env.NEXT_PHASE;
    await expect(async () => {
      await import('@/lib/firebase?force=' + Date.now());
    }).rejects.toThrow(/FIREBASE/);
    process.env.NEXT_PHASE = prev;
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run tests/unit/lib/firebase-env.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add runtime assertion to `lib/firebase.ts`**

Replace file contents:

```typescript
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!isBuild && (!apiKey || !authDomain || !projectId)) {
  throw new Error(
    'Missing NEXT_PUBLIC_FIREBASE_* env vars. Set NEXT_PUBLIC_FIREBASE_API_KEY, ' +
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID.',
  );
}

const firebaseConfig = {
  apiKey: apiKey || 'dummy-key-for-build',
  authDomain: authDomain || 'localhost',
  projectId: projectId || 'demo-project',
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export default app;
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run tests/unit/lib/firebase-env.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/firebase.ts tests/unit/lib/firebase-env.test.ts
git commit -m "security: fail fast on missing NEXT_PUBLIC_FIREBASE_* env vars"
```

---

### Task 12: Reconcile with code-health `withAuth()` wrapper (conditional)

**Files:**
- Modify: every route under `app/api/**` that was touched in Task 5

**Effort:** M (if needed; S if code-health has not landed yet)

- [ ] **Step 1: Check whether `lib/with-auth.ts` or a wrapper export in `lib/auth.ts` exists on the target branch**

Run: `git log --all --oneline -- lib/auth.ts lib/with-auth.ts | head -20`

- [ ] **Step 2a: If wrapper exists**

Replace each `getCallerRole(request)` + rate-limit-unauth block with a `withAuth({ allow: ['teacher','admin'], rateLimitKey: '<route-key>' })` wrapper call. Preserve the per-teacher scoping logic from Task 7.

- [ ] **Step 2b: If wrapper does not yet exist**

No-op. Leave a `// TODO(code-health): migrate to withAuth()` comment on each touched route.

- [ ] **Step 3: Run full unit suite**

Run: `npx vitest run tests/unit/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api
git commit -m "security: reconcile per-route auth with code-health withAuth wrapper (or TODO)"
```

---

## Touched Files Index (conflict detection)

**Core libs (shared with code-health track):**
- `lib/auth.ts` — Task 1 (timing-safe compare)
- `lib/rate-limit.ts` — Task 2 (new)
- `lib/projections.ts` — Task 3 (new)
- `lib/firestore.ts` — Tasks 7, 8
- `lib/types.ts` — Task 8
- `lib/firebase.ts` — Task 11
- `lib/auth-context.tsx` — Task 10
- `lib/camp-code.ts` — Task 7

**Routes (shared with UX track + code-health track):**
- `app/api/faculty/route.ts` — Tasks 3, 5
- `app/api/faculty/[id]/route.ts` — Task 3
- `app/api/faculty/[id]/sessions/route.ts` — Task 5
- `app/api/attendance/route.ts` — Tasks 5, 6, 7 (**also UX track**)
- `app/api/attendance/report/route.ts` — Task 5
- `app/api/sessions/route.ts` — Task 5
- `app/api/sessions/[id]/route.ts` — Task 5
- `app/api/sessions/[id]/students/route.ts` — Tasks 4, 5
- `app/api/students/route.ts` — Task 5
- `app/api/students/[id]/route.ts` — Task 5
- `app/api/students/[id]/schedule/route.ts` — Task 5
- `app/api/schedule/route.ts` — Task 5
- `app/api/stats/route.ts` — Task 5
- `app/api/import/students/route.ts` — Task 5
- `app/api/import/sessions/route.ts` — Task 5
- `app/api/import/faculty/route.ts` — Task 5
- `app/api/import/enrollments/route.ts` — Task 5
- `app/api/admin/login/route.ts` — **deleted** Task 10

**Client pages:**
- `app/page.tsx` — Task 3
- `app/teacher/[facultyId]/**` — Task 7

**Firestore rules:**
- `firestore.rules` — Task 9

**Seed scripts:**
- `scripts/anonymize-and-seed.js` — Task 1
- `scripts/seed-remaining-attendance.js` — Task 1

**Tests:**
- `tests/unit/lib/auth.test.ts` — Task 1
- `tests/unit/lib/rate-limit.test.ts` — Task 2 (new)
- `tests/unit/lib/rate-limit-integration.test.ts` — Task 5 (new)
- `tests/unit/lib/projections.test.ts` — Tasks 3, 4 (new)
- `tests/unit/lib/firestore.test.ts` — Task 8
- `tests/unit/lib/firebase-env.test.ts` — Task 11 (new)
- `tests/unit/api/attendance-post.test.ts` — Task 6 (new)
- `tests/unit/api/attendance-get.test.ts` — Task 7 (new)
- `tests/security/firestore-rules.test.ts` — Task 9

## Deployment blockers flagged for the ops handoff

1. Rotate `CAMP_CODE` to a non-guessable value (32+ random chars). Drop the `'camp2026'` literal everywhere.
2. Run a one-shot cleanup migration to unset denormalized PII fields from existing `attendance/*` docs in production Firestore before deploy (Task 8 only stops new writes).
3. Confirm `NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID` are set in the deploy environment; missing values now crash the process on boot.
4. Verify CSP/HSTS are set somewhere — owned by code-health track, not security.
5. `TEST_ADMIN_TOKEN` + Firestore emulator must be wired by code-health before the integration + security rules suites can run in CI.

---

## Effort summary

| Task | Effort |
|---|---|
| 1. Camp code rotation & timing-safe compare | M |
| 2. Rate limiter lib | M |
| 3. Faculty projection + gate | M |
| 4. Session students dorm_room strip | S |
| 5. Wire rate limiter into 17 routes | M |
| 6. Attendance POST validation | M |
| 7. Attendance GET per-teacher scoping | M |
| 8. De-denormalize parent PII | L |
| 9. Firestore rules default-deny | S |
| 10. Delete cookie writer + admin/login | S |
| 11. Fail-fast Firebase env | S |
| 12. Reconcile with withAuth wrapper | S/M |

**Total serial:** ~9–10 hours. **Parallelized with 2 agents:** ~4–5 hours.
