# Code-Health Track Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is ONE of three parallel tracks: code-health (this), security, and UX. See "Cross-cluster coordination" below before starting.

**Goal:** Bring the TTU Camp Attendance codebase to a known-good baseline: real lint, strict TS, no dead SQLite layer, no DYNAMIC_SERVER_USAGE build errors, a green `npm test`, a shared auth wrapper, and eliminated N+1 Firestore reads.

**Architecture:** Next.js 14 App Router on Firebase Hosting (webframeworks experiment), Firestore via `firebase-admin`, auth via Firebase ID tokens (admin) + camp code header (teacher). Server routes currently duplicate the same try/role-check/500 shape. This track does not change external API contracts — it only tightens types, removes dead code, centralizes auth plumbing, and fixes hidden correctness bugs (timezone, N+1).

**Tech Stack:** Next.js 14, TypeScript 5.3, Firestore (Admin SDK), Firebase Auth, Vitest (unit + integration), Playwright (e2e), ESLint (to be added), Firebase Emulator Suite.

---

## Cross-cluster coordination (READ FIRST)

This track ships alongside security and UX tracks. Hard rules:

1. **Phase A MUST land before either other track writes new code.** Phase A enables strict TS, adds ESLint, fixes the test harness, and puts `force-dynamic` on every current route. Every file those tracks touch will be affected by strict TS fallout — if they write code first, they get graded on rules that weren't there when they started.
2. **`withAuth` wrapper (Phase C) MUST land before either other track adds new routes.** Both tracks are adding routes that need auth. If they adopt `withAuth` from day one, we avoid converting their new work later. Ship Phase C immediately after Phase A.
3. **`middleware.ts` deletion (Phase B, Task 6) conflicts with security.** The security track may want `middleware.ts` for CSP/HSTS. Decision: **code-health does NOT delete `middleware.ts`; security track owns middleware's fate.** We only delete it in Task 6 if security has confirmed they won't use it. Otherwise we only delete the no-op body and leave the file empty-shelled for security to repurpose.
4. **`force-dynamic` additions (Phase A, Task 4) touch all 17 route files** — the same files security will touch to tighten `getCallerRole` logic and UX will touch for new query params. Code-health goes first, other tracks rebase onto the force-dynamic export line.
5. **`getTodayDate()` timezone fix (Phase D, Task 10) overlaps with UX.** UX is doing "date/config foundation" work. **Decision: code-health owns the single `getTodayDate()` function in `lib/firestore.ts` because it's a correctness bug (wrong "today" after 7pm local), not a UX concern.** UX can depend on it; we ship it behind a pure function that accepts an injectable `now: Date` so UX can test-drive it.
6. **Dependency cleanup (Phase E)** is lockfile-touching — coordinate a single "dep bump" window with the other tracks to avoid lockfile merge conflicts.

---

## File structure map

Files this track will touch:

### Created
- `.eslintrc.json` — ESLint config extending `next/core-web-vitals`
- `.nvmrc` — Pin Node version to match Firebase runtime
- `lib/with-auth.ts` — Route auth wrapper (the `withAuth(role, handler)` pattern)
- `lib/date.ts` — Timezone-correct `getTodayDate()` (split out of `lib/firestore.ts`)
- `tests/unit/lib/with-auth.test.ts` — Unit tests for the wrapper
- `tests/unit/lib/date.test.ts` — Unit tests for the timezone-correct date function
- `scripts/test-with-emulator.sh` — Bootstraps emulator + mints `TEST_ADMIN_TOKEN` + runs integration tests
- `docs/plans/code-health-track.md` — This file

### Modified
- `tsconfig.json` — Enable `strict`, drop `exclude` of `lib/db.ts`, drop `scripts` exclude
- `package.json` — Scripts (split `test`), move devDeps, remove unused deps, add `engines`
- `lib/firebase-admin.ts` — Replace Proxy with `getAdminDb()` / `getAdminAuth()` getters (and a back-compat `adminDb` re-export for the duration of the migration)
- `lib/firestore.ts` — Type the 5 `Promise<any>` returns, fix N+1s, remove `getTodayDate()` (now imports from `lib/date.ts`), drop client-side attendance filters in favor of composite indexes
- `lib/auth.ts` — No behavior change; referenced by wrapper
- All 17 `app/api/**/route.ts` — Add `export const dynamic = 'force-dynamic'`, then migrate to `withAuth(...)` wrapper
- `app/api/import/students/route.ts` — Fix O(n²) `indexOf` + parallelize `createStudent` batch
- `README.md`, `HANDOFF.md`, `BUILD_MANIFEST.txt`, `SETUP.md`, `SETUP_CHECKLIST.md` — Remove SQLite references
- `.husky/` — Either wire up a pre-commit hook running `lint + typecheck` or remove `prepare` script

### Deleted
- `lib/db.ts` (dead SQLite layer, 484 lines, SQL-injection footgun)
- `scripts/seed.ts` (pure SQLite)
- `scripts/seed-test-data.js` (pure SQLite)
- `scripts/anonymize-and-seed.js` (reads from gone SQLite db; was one-time migration)
- `scripts/seed-remaining-attendance.js` (reads from gone SQLite db; was one-time recovery)
- `data/camp.db`, `data/camp.db-shm`, `data/camp.db-wal` (SQLite database files)
- `better-sqlite3` from `devDependencies`
- `@opentelemetry/api` from `dependencies` (unused)
- Possibly `middleware.ts` (pending security track decision — see rule 3)

---

## Phases and dependency graph

```
Phase A (prereq for all other tracks)
  Task 1: ESLint config
  Task 2: Strict TS
  Task 3: Fix lib/firebase-admin.ts Proxy (prereq for strict TS fallout)
  Task 4: force-dynamic on all routes
  Task 5: Test harness fix

Phase B (safe deletions — parallel with A after Task 3)
  Task 6: Delete middleware.ts (coordinate with security)
  Task 7: Delete dead SQLite layer
  Task 8: Remove SQLite doc references

Phase C (withAuth wrapper — blocks other tracks from adding routes)
  Task 9: TDD withAuth wrapper + convert one route
  Task 10: Batch-convert remaining 16 routes

Phase D (N+1 and correctness — parallel with C)
  Task 11: lib/date.ts with America/Chicago tz
  Task 12: Type the 5 Promise<any> returns
  Task 13: Parallelize getFacultySessions N+1
  Task 14: Parallelize getStudentSchedule N+1
  Task 15: Parallelize getSessionStudentsFull N+1
  Task 16: Fix import/students O(n²) + parallelize
  Task 17: Drop client-side attendance filter, use composite index

Phase E (dependency cleanup — anytime after A, coordinate lockfile window)
  Task 18: Move build deps to devDependencies
  Task 19: Remove unused @opentelemetry/api
  Task 20: Add .nvmrc + engines
  Task 21: Husky decision
```

Within-track parallelization: after Phase A completes, Phase B + Phase C + Phase D can run in parallel on separate branches as long as they don't both touch `lib/firestore.ts` at the same time (Tasks 12–17 are serial within themselves because they all touch that file; B tasks and C tasks don't touch it). Phase E can run anytime after A.

---

## Phase A: Prerequisites (blocks all other work)

### Task 1: Add ESLint config

**Files:**
- Create: `.eslintrc.json`
- Modify: `package.json` (no script change needed — `lint` already runs `next lint`)

- [ ] **Step 1: Create `.eslintrc.json` with the following exact content**

```json
{
  "extends": ["next/core-web-vitals"],
  "rules": {
    "@next/next/no-html-link-for-pages": "off",
    "react/no-unescaped-entities": "off",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "ignorePatterns": [
    "node_modules/",
    ".next/",
    "out/",
    "scripts/",
    "playwright-report/"
  ]
}
```

- [ ] **Step 2: Run `npm run lint` and verify it completes without the interactive prompt**

Expected: Either "No ESLint warnings or errors" or a list of rule violations to fix.

- [ ] **Step 3: Fix any lint violations reported**

- [ ] **Step 4: Run `npm run lint` to confirm clean**

Expected: No warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.json
git commit -m "chore(lint): add ESLint config extending next/core-web-vitals"
```

**Effort:** S

---

### Task 2: Enable TypeScript strict mode

**Files:**
- Modify: `tsconfig.json`
- Modify: `lib/firestore.ts` (fallout)

- [ ] **Step 1: Update `tsconfig.json` — enable strict**

Replace the `compilerOptions.strict` and `exclude` sections:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"],
    "allowJs": true,
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "lib/db.ts",
    "scripts",
    "data"
  ]
}
```

Note: We keep `lib/db.ts` excluded for now — Task 7 deletes it. After Task 7, drop both excludes.

- [ ] **Step 2: Run `npx tsc --noEmit` and capture fallout list**

Expected fallout:
- `lib/firestore.ts` — optional field narrowings in `markAttendance`
- Possible issues in React components using `useState<T>()` without explicit types
- `lib/firebase-admin.ts` Proxy (fixed in Task 3)

- [ ] **Step 3: Fix fallout file by file**

Minimal-change principle: add explicit types or guards, don't refactor. Proper typing of `Promise<any>` happens in Task 12.

- [ ] **Step 4: Verify `npx tsc --noEmit` returns 0 errors**

- [ ] **Step 5: Run `npm run test:unit`**

Expected: 29/29 passing.

- [ ] **Step 6: Run `npm run build`**

Expected: Build completes. DYNAMIC_SERVER_USAGE errors still expected — fixed in Task 4.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json lib/ app/ tests/
git commit -m "chore(ts): enable strict mode and fix fallout"
```

**Effort:** M

---

### Task 3: Replace `lib/firebase-admin.ts` Proxy with typed getters

**Files:**
- Modify: `lib/firebase-admin.ts`

- [ ] **Step 1: Rewrite `lib/firebase-admin.ts`**

```typescript
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function getApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length) {
    _app = existing[0]!;
    return _app;
  }
  _app = initializeApp({
    credential: cert({
      projectId: process.env.FB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FB_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: (process.env.FB_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
    }),
  });
  return _app;
}

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getApp());
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getApp());
  return _auth;
}

// Back-compat exports — callers use these today. Both are lazy because they
// only resolve when a property is accessed, which happens at request time.
// TODO(code-health): migrate callers to getAdminDb() / getAdminAuth() and remove.
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    return Reflect.get(getAdminDb(), prop, receiver);
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    return Reflect.get(getAdminAuth(), prop, receiver);
  },
});
```

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: 0 errors.

- [ ] **Step 3: Run `npm run test:unit`**

- [ ] **Step 4: Run `npm run build`**

- [ ] **Step 5: Commit**

```bash
git add lib/firebase-admin.ts
git commit -m "refactor(admin): replace Proxy-with-any shim with typed getAdminDb/getAdminAuth"
```

**Effort:** S

---

### Task 4: Add `force-dynamic` to all 17 API routes

**Files:**
- Modify: all files under `app/api/**/route.ts`

- [ ] **Step 1: For each route file, add `export const dynamic = 'force-dynamic';` near the top**

Full list:
1. `app/api/admin/login/route.ts`
2. `app/api/attendance/route.ts`
3. `app/api/attendance/report/route.ts`
4. `app/api/faculty/route.ts`
5. `app/api/faculty/[id]/route.ts`
6. `app/api/faculty/[id]/sessions/route.ts`
7. `app/api/import/enrollments/route.ts`
8. `app/api/import/faculty/route.ts`
9. `app/api/import/sessions/route.ts`
10. `app/api/import/students/route.ts`
11. `app/api/schedule/route.ts`
12. `app/api/sessions/route.ts`
13. `app/api/sessions/[id]/route.ts`
14. `app/api/sessions/[id]/students/route.ts`
15. `app/api/stats/route.ts`
16. `app/api/students/route.ts`
17. `app/api/students/[id]/route.ts`
18. `app/api/students/[id]/schedule/route.ts`

Verify actual count with `find app/api -name 'route.ts' | wc -l` and patch all of them.

- [ ] **Step 2: Run `npm run build`**

Expected: Build completes with zero DYNAMIC_SERVER_USAGE warnings. All routes show `λ` (Dynamic).

- [ ] **Step 3: Run `npm run lint`**

- [ ] **Step 4: Run `npm run test:unit`**

- [ ] **Step 5: Commit**

```bash
git add app/api/
git commit -m "fix(api): mark all routes as force-dynamic (they all read headers via getCallerRole)"
```

**Effort:** S

---

### Task 5: Fix `npm test` so default target is green

**Files:**
- Modify: `package.json` (scripts)
- Create: `scripts/test-with-emulator.sh`

- [ ] **Step 1: Update `package.json` scripts**

Replace the `scripts` block:

```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests/unit/",
    "test:unit": "vitest run tests/unit/",
    "test:integration": "bash scripts/test-with-emulator.sh",
    "test:security": "bash scripts/test-with-emulator.sh tests/security/",
    "test:all": "npm run lint && npm run typecheck && npm run test:unit && npm run test:integration",
    "test:e2e": "playwright test",
    "test:watch": "vitest watch tests/unit/",
    "prepare": "husky"
  }
}
```

- [ ] **Step 2: Create `scripts/test-with-emulator.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Bootstrap Firebase emulator, mint a TEST_ADMIN_TOKEN, run integration tests.
# Usage:
#   scripts/test-with-emulator.sh                     # runs tests/integration/ + tests/security/
#   scripts/test-with-emulator.sh tests/security/     # runs only given path

TARGET_PATHS="${*:-tests/integration/ tests/security/}"

export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FB_PROJECT_ID=demo-test-project
export FIREBASE_PROJECT_ID=demo-test-project
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test-project
export CAMP_CODE=test-camp-2026

npx firebase emulators:start --only firestore,auth --project demo-test-project &
EMULATOR_PID=$!
trap "kill $EMULATOR_PID 2>/dev/null || true" EXIT

for i in {1..30}; do
  if curl -s "http://127.0.0.1:8080" > /dev/null 2>&1 && \
     curl -s "http://127.0.0.1:9099" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

TEST_ADMIN_TOKEN=$(node -e "
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ projectId: 'demo-test-project' });
(async () => {
  const auth = getAuth();
  let uid;
  try {
    const u = await auth.getUserByEmail('admin@test.com');
    uid = u.uid;
  } catch {
    const u = await auth.createUser({ email: 'admin@test.com', password: 'testpassword123' });
    uid = u.uid;
  }
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const json = await res.json();
  process.stdout.write(json.idToken);
})();
")
export TEST_ADMIN_TOKEN

if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
  npm run dev &
  DEV_PID=$!
  trap "kill $DEV_PID 2>/dev/null || true; kill $EMULATOR_PID 2>/dev/null || true" EXIT
  for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then break; fi
    sleep 1
  done
fi

npx vitest run $TARGET_PATHS
```

Mark executable: `chmod +x scripts/test-with-emulator.sh`.

- [ ] **Step 3: Run `npm test` and confirm only unit tests run**

- [ ] **Step 4: Run `npm run test:integration` locally**

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/test-with-emulator.sh
git commit -m "test: split npm test into unit (default) and integration (emulator-driven)"
```

**Effort:** M

---

**Phase A complete.** Other tracks can now start.

---

## Phase B: Safe deletions

### Task 6: Delete `middleware.ts` (coordinate with security)

**Files:**
- Delete: `middleware.ts`

- [ ] **Step 1: Confirm with security track that they will NOT use middleware.ts**

If security wants middleware for CSP/HSTS: skip this task entirely.

- [ ] **Step 2: Delete the file**

```bash
git rm middleware.ts
```

- [ ] **Step 3: Run `npm run build`**

- [ ] **Step 4: Run `npm test`**

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete no-op middleware.ts"
```

**Effort:** S

---

### Task 7: Delete dead SQLite layer

**Files:**
- Delete: `lib/db.ts`, `scripts/seed.ts`, `scripts/seed-test-data.js`, `scripts/anonymize-and-seed.js`, `scripts/seed-remaining-attendance.js`, `data/camp.db*`
- Modify: `package.json`, `tsconfig.json`

- [ ] **Step 1: Confirm no application code imports from `lib/db.ts`**

Grep for `from '@/lib/db'` and `from './db'`. Expected: zero hits in application code.

- [ ] **Step 2: Confirm all four scripts are SQLite-based**

- [ ] **Step 3: Delete dead files**

```bash
git rm lib/db.ts
git rm scripts/seed.ts
git rm scripts/seed-test-data.js
git rm scripts/anonymize-and-seed.js
git rm scripts/seed-remaining-attendance.js
git rm data/camp.db data/camp.db-shm data/camp.db-wal
```

- [ ] **Step 4: Remove `better-sqlite3`**

```bash
npm uninstall better-sqlite3
```

- [ ] **Step 5: Drop `lib/db.ts` and `scripts` excludes from `tsconfig.json`**

```json
"exclude": ["node_modules", "data"]
```

- [ ] **Step 6: Run `npx tsc --noEmit`**

- [ ] **Step 7: Run `npm run lint`**

- [ ] **Step 8: Run `npm run build`**

- [ ] **Step 9: Run `npm test`**

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: delete dead SQLite layer (lib/db.ts, seed scripts, camp.db, better-sqlite3 dep)"
```

**Effort:** S

---

### Task 8: Remove SQLite references from docs

**Files:**
- Modify: `README.md`, `HANDOFF.md`, `BUILD_MANIFEST.txt`, `SETUP.md`, `SETUP_CHECKLIST.md`

- [ ] **Step 1: In each file, search for `sqlite`, `SQLite`, `better-sqlite3`, `camp.db`, `seed.ts`**

- [ ] **Step 2: Delete or rewrite each hit**

- [ ] **Step 3: Verify no remaining hits**

- [ ] **Step 4: Commit**

```bash
git add README.md HANDOFF.md BUILD_MANIFEST.txt SETUP.md SETUP_CHECKLIST.md
git commit -m "docs: remove references to deleted SQLite layer"
```

**Effort:** S

---

## Phase C: withAuth wrapper

### Task 9: TDD `withAuth` wrapper and convert one route

**Files:**
- Create: `lib/with-auth.ts`
- Create: `tests/unit/lib/with-auth.test.ts`
- Modify: `app/api/attendance/report/route.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/with-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/with-auth';

vi.mock('@/lib/auth', () => ({
  getCallerRole: vi.fn(),
}));

import { getCallerRole } from '@/lib/auth';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/test');
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.mocked(getCallerRole).mockReset();
  });

  it('returns 401 when no role', async () => {
    vi.mocked(getCallerRole).mockResolvedValue(null);
    const handler = withAuth('teacher', async () => new Response('ok'));
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when role is insufficient', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('teacher');
    const handler = withAuth('admin', async () => new Response('ok'));
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Admin access required' });
  });

  it('calls handler when role is sufficient', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('admin');
    const inner = vi.fn(async () => Response.json({ ok: true }));
    const handler = withAuth('admin', inner);
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledOnce();
    const [req, ctx] = inner.mock.calls[0]!;
    expect(ctx.role).toBe('admin');
  });

  it('returns 500 and logs on handler throw', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('admin');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = withAuth('admin', async () => { throw new Error('boom'); });
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('teacher requirement accepts both teacher and admin', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('teacher');
    const handler = withAuth('teacher', async () => Response.json({ ok: true }));
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

- [ ] **Step 3: Create `lib/with-auth.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCallerRole, CallerRole } from './auth';

export type RequiredRole = 'admin' | 'teacher';

export interface AuthedHandlerContext<P = Record<string, string>> {
  params: P;
  role: Exclude<CallerRole, null>;
}

export type AuthedHandler<P = Record<string, string>> = (
  request: NextRequest,
  context: AuthedHandlerContext<P>
) => Promise<Response> | Response;

export type RouteContext<P = Record<string, string>> = { params: P };

/**
 * Wraps an App Router route handler with role-based auth.
 * - Returns 401 if caller has no role.
 * - Returns 403 if caller's role is insufficient for the requirement.
 * - Returns 500 on any thrown error (logs via console.error).
 *
 * Role hierarchy: admin > teacher. Requiring 'teacher' accepts both.
 */
export function withAuth<P = Record<string, string>>(
  required: RequiredRole,
  handler: AuthedHandler<P>
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      const role = await getCallerRole(request);

      if (!role) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (required === 'admin' && role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      return await handler(request, { params: context.params, role });
    } catch (error) {
      console.error('[withAuth] handler error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Convert `app/api/attendance/report/route.ts` as proof-of-concept**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAttendanceReport } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth('admin', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const status = searchParams.get('status');

  if (!date) {
    return NextResponse.json({ error: 'Missing required parameter: date' }, { status: 400 });
  }

  const report = await getAttendanceReport(date, status as 'absent' | 'tardy' | undefined);
  return NextResponse.json(report);
});
```

- [ ] **Step 6: Run `npx tsc --noEmit`**

- [ ] **Step 7: Run `npm run test:unit`**

- [ ] **Step 8: Run `npm run build`**

- [ ] **Step 9: Commit**

```bash
git add lib/with-auth.ts tests/unit/lib/with-auth.test.ts app/api/attendance/report/route.ts
git commit -m "feat(auth): add withAuth wrapper, convert attendance/report route as proof"
```

**Effort:** M

---

### Task 10: Batch-convert remaining routes to `withAuth`

**Files:**
- Modify: all remaining `app/api/**/route.ts` files (except `attendance/report` and `admin/login`)

Routes to convert:
- `app/api/attendance/route.ts`
- `app/api/faculty/route.ts`
- `app/api/faculty/[id]/route.ts`
- `app/api/faculty/[id]/sessions/route.ts`
- `app/api/import/enrollments/route.ts`
- `app/api/import/faculty/route.ts`
- `app/api/import/sessions/route.ts`
- `app/api/import/students/route.ts`
- `app/api/schedule/route.ts`
- `app/api/sessions/route.ts`
- `app/api/sessions/[id]/route.ts`
- `app/api/sessions/[id]/students/route.ts`
- `app/api/stats/route.ts`
- `app/api/students/route.ts`
- `app/api/students/[id]/route.ts`
- `app/api/students/[id]/schedule/route.ts`

- [ ] **Step 1: For each file, replace the try/catch/role-check boilerplate**

Mechanical pattern:

```typescript
// BEFORE:
export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    // handler body
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// AFTER:
export const GET = withAuth('admin', async (request) => {
  // handler body (unchanged)
});
```

For routes with params:

```typescript
export const GET = withAuth<{ id: string }>('teacher', async (request, { params }) => {
  // uses params.id
});
```

- [ ] **Step 2: Preserve the `export const dynamic = 'force-dynamic'` line**

- [ ] **Step 3: Convert in small commits — 3–4 routes per commit**

After each commit:
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
```

- [ ] **Step 4: Full verification after all routes converted**

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
npm run test:integration
```

- [ ] **Step 5: Verify no remaining bare `getCallerRole` calls**

Grep for `getCallerRole` under `app/api/`. Expected: only hits are inside `lib/with-auth.ts` and `app/api/admin/login/route.ts`.

- [ ] **Step 6: Final commit**

```bash
git add app/api/
git commit -m "refactor(api): migrate all routes to withAuth wrapper"
```

**Effort:** L

---

**Phase C complete.** Other tracks can now write new routes using `withAuth` from day one.

---

## Phase D: N+1 and correctness fixes

### Task 11: Timezone-correct `getTodayDate()`

**Files:**
- Create: `lib/date.ts`
- Create: `tests/unit/lib/date.test.ts`
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/lib/date.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getTodayDate } from '@/lib/date';

describe('getTodayDate', () => {
  it('returns YYYY-MM-DD in America/Chicago timezone', () => {
    const utcEvening = new Date('2026-06-08T03:00:00Z');
    expect(getTodayDate(utcEvening)).toBe('2026-06-07');
  });

  it('rolls to next day at midnight Central', () => {
    const justPastMidnightCentral = new Date('2026-06-08T06:00:00Z');
    expect(getTodayDate(justPastMidnightCentral)).toBe('2026-06-08');
  });

  it('handles standard time correctly', () => {
    const winterEvening = new Date('2026-01-15T05:00:00Z');
    expect(getTodayDate(winterEvening)).toBe('2026-01-14');
  });

  it('defaults to new Date() when no arg', () => {
    expect(getTodayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

- [ ] **Step 3: Create `lib/date.ts`**

```typescript
/**
 * Date helpers pinned to camp timezone (America/Chicago).
 * The camp runs in Lubbock, TX — do NOT use UTC for "today" calculations.
 */

const CAMP_TZ = 'America/Chicago';

export function getTodayDate(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

export function getCurrentTimeHHMM(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(now);
}
```

- [ ] **Step 4: Run the test to verify it passes**

- [ ] **Step 5: Update `lib/firestore.ts` to import from `./date`**

```typescript
export { getTodayDate } from './date';

export async function getCurrentPeriod(): Promise<number | null> {
  const { getCurrentTimeHHMM } = await import('./date');
  const currentTime = getCurrentTimeHHMM();
  const periods = await getPeriods();
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i]!;
    if (currentTime >= p.start_time && currentTime < p.end_time) {
      return p.number;
    }
  }
  return null;
}
```

- [ ] **Step 6: Run all checks**

- [ ] **Step 7: Commit**

```bash
git add lib/date.ts lib/firestore.ts tests/unit/lib/date.test.ts
git commit -m "fix(date): use America/Chicago timezone for camp 'today' (was UTC)"
```

**Effort:** S

---

### Task 12: Type the five `Promise<any>` returns in `lib/firestore.ts`

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Add new interfaces to `lib/types.ts`**

```typescript
export interface FacultySessionRow {
  id: string;
  name: string;
  type: Session['type'];
  location?: string;
  period_number: number;
  start_time: string;
  end_time: string;
  period_name: string;
  ensemble?: string;
  instrument?: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  tardy_count: number;
}

export interface StudentScheduleRow {
  session_id: string;
  name: string;
  type: Session['type'];
  location?: string;
  period_number: number;
  start_time: string;
  end_time: string;
  period_name: string;
  teacher_name: string;
  attendance_status: 'present' | 'absent' | 'tardy' | 'unmarked';
  date: string | null;
}

export interface ScheduleGridRow {
  id: string;
  name: string;
  type: Session['type'];
  location?: string;
  ensemble?: string;
  instrument?: string;
  period_id: string;
  faculty_id?: string;
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
  faculty_name: string;
  student_count: number;
}

export interface SessionWithPeriod extends Session {
  period_number: number;
  period_name: string;
  start_time: string;
  end_time: string;
}

export interface DailyStats {
  present: number;
  absent: number;
  tardy: number;
  unmarked: number;
  total: number;
}
```

- [ ] **Step 2: Update `lib/firestore.ts` signatures**

```typescript
export async function getFacultySessions(facultyId: string, date?: string): Promise<FacultySessionRow[]> { }
export async function getStudentSchedule(studentId: string, date?: string): Promise<StudentScheduleRow[]> { }
export async function getScheduleGrid(): Promise<ScheduleGridRow[]> { }
export async function getSessionWithPeriod(id: string): Promise<SessionWithPeriod | undefined> { }
export async function getDailyStats(date: string): Promise<DailyStats> { }
```

- [ ] **Step 3: Run `npx tsc --noEmit`**

Fix any caller fallout by adding explicit types.

- [ ] **Step 4: Run `npm run test:unit`**

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/firestore.ts app/api/
git commit -m "refactor(firestore): replace Promise<any> with concrete row interfaces"
```

**Effort:** M

---

### Task 13: Parallelize `getFacultySessions` N+1

**Files:**
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Replace `getFacultySessions` with parallelized version**

```typescript
export async function getFacultySessions(facultyId: string, date?: string): Promise<FacultySessionRow[]> {
  const todayDate = date || getTodayDate();

  const [sessSnap, periods] = await Promise.all([
    sessionsCol().where('faculty_id', '==', facultyId).get(),
    getPeriods(),
  ]);

  if (sessSnap.empty) return [];

  const periodMap = new Map(periods.map(p => [p.id, p]));

  const perSession = await Promise.all(
    sessSnap.docs.map(async (sessDoc) => {
      const sess = { id: sessDoc.id, ...sessDoc.data() } as Session;

      const [enrolledSnap, attSnap] = await Promise.all([
        sessionStudentsCol().where('session_id', '==', sess.id).get(),
        attendanceCol()
          .where('session_id', '==', sess.id)
          .where('date', '==', todayDate)
          .get(),
      ]);

      let presentCount = 0, absentCount = 0, tardyCount = 0;
      for (const attDoc of attSnap.docs) {
        const st = attDoc.data().status;
        if (st === 'present') presentCount++;
        else if (st === 'absent') absentCount++;
        else if (st === 'tardy') tardyCount++;
      }

      const period = periodMap.get(sess.period_id);
      return {
        id: sess.id,
        name: sess.name,
        type: sess.type,
        location: sess.location,
        period_number: period?.number ?? 0,
        start_time: period?.start_time ?? '',
        end_time: period?.end_time ?? '',
        period_name: period?.name ?? '',
        ensemble: sess.ensemble,
        instrument: sess.instrument,
        total_students: enrolledSnap.size,
        present_count: presentCount,
        absent_count: absentCount,
        tardy_count: tardyCount,
      } satisfies FacultySessionRow;
    })
  );

  perSession.sort((a, b) => a.period_number - b.period_number);
  return perSession;
}
```

- [ ] **Step 2: Verify corresponding composite index exists**

- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run test:unit`**

- [ ] **Step 4: Commit**

```bash
git add lib/firestore.ts
git commit -m "perf(firestore): parallelize getFacultySessions + use composite attendance index"
```

**Effort:** M

---

### Task 14: Parallelize `getStudentSchedule` N+1

**Files:**
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Replace `getStudentSchedule`**

```typescript
export async function getStudentSchedule(studentId: string, date?: string): Promise<StudentScheduleRow[]> {
  const todayDate = date || getTodayDate();

  const ssSnap = await sessionStudentsCol()
    .where('student_id', '==', studentId)
    .get();

  if (ssSnap.empty) return [];

  const sessionIds = ssSnap.docs.map(d => d.data().session_id as string);
  const periods = await getPeriods();
  const periodMap = new Map(periods.map(p => [p.id, p]));

  const rows = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const [sess, att] = await Promise.all([
        getSession(sessionId),
        getAttendance(studentId, sessionId, todayDate),
      ]);

      if (!sess) return null;

      const period = periodMap.get(sess.period_id);
      const faculty = sess.faculty_id ? await getFacultyMember(sess.faculty_id) : undefined;
      const teacherName = faculty ? `${faculty.first_name} ${faculty.last_name}` : 'TBA';

      return {
        session_id: sess.id,
        name: sess.name,
        type: sess.type,
        location: sess.location,
        period_number: period?.number ?? 0,
        start_time: period?.start_time ?? '',
        end_time: period?.end_time ?? '',
        period_name: period?.name ?? '',
        teacher_name: teacherName,
        attendance_status: att?.status ?? 'unmarked',
        date: att?.date ?? null,
      } satisfies StudentScheduleRow;
    })
  );

  const filtered = rows.filter((r): r is StudentScheduleRow => r !== null);
  filtered.sort((a, b) => a.period_number - b.period_number);
  return filtered;
}
```

- [ ] **Step 2: Run checks**

- [ ] **Step 3: Commit**

```bash
git add lib/firestore.ts
git commit -m "perf(firestore): parallelize getStudentSchedule per-session reads"
```

**Effort:** S

---

### Task 15: Parallelize `getSessionStudentsFull` N+1

**Files:**
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Replace with `getAll()` batched reads**

```typescript
export async function getSessionStudentsFull(sessionId: string): Promise<Student[]> {
  const ssSnap = await sessionStudentsCol()
    .where('session_id', '==', sessionId)
    .get();

  if (ssSnap.empty) return [];

  const studentIds = ssSnap.docs.map(d => d.data().student_id as string);
  const refs = studentIds.map(id => studentsCol().doc(id));
  const snaps = await getAdminDb().getAll(...refs);
  const students = snaps
    .filter(s => s.exists)
    .map(s => ({ id: s.id, ...s.data() } as Student));

  students.sort((a, b) => {
    if (a.last_name !== b.last_name) return a.last_name.localeCompare(b.last_name);
    return a.first_name.localeCompare(b.first_name);
  });

  return students;
}
```

- [ ] **Step 2: Run checks**

- [ ] **Step 3: Commit**

```bash
git add lib/firestore.ts
git commit -m "perf(firestore): batch getSessionStudentsFull via getAll() instead of sequential reads"
```

**Effort:** S

---

### Task 16: Fix O(n²) and sequential writes in `import/students`

**Files:**
- Modify: `app/api/import/students/route.ts`

- [ ] **Step 1: Replace body with parallel-batched implementation**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createStudent } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

interface ImportedStudent {
  first_name: string;
  last_name: string;
  preferred_name?: string;
  gender?: string;
  division?: string;
  instrument: string;
  ensemble: string;
  chair_number?: string;
  dorm_building?: string;
  dorm_room?: string;
  email?: string;
  cell_phone?: string;
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  medical_notes?: string;
  additional_info?: string;
}

export const POST = withAuth('admin', async (request: NextRequest) => {
  const { students } = (await request.json()) as { students: ImportedStudent[] };

  if (!Array.isArray(students) || students.length === 0) {
    return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
  }

  const results = { success: 0, failed: 0, errors: [] as string[] };

  const BATCH = 25;
  for (let i = 0; i < students.length; i += BATCH) {
    const chunk = students.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      chunk.map(student =>
        createStudent({
          first_name: student.first_name,
          last_name: student.last_name,
          preferred_name: student.preferred_name,
          gender: student.gender,
          division: student.division || 'Commuter',
          instrument: student.instrument,
          ensemble: student.ensemble,
          chair_number: student.chair_number ? parseInt(student.chair_number, 10) : undefined,
          dorm_building: student.dorm_building,
          dorm_room: student.dorm_room,
          email: student.email,
          cell_phone: student.cell_phone,
          parent_first_name: student.parent_first_name,
          parent_last_name: student.parent_last_name,
          parent_phone: student.parent_phone,
          medical_notes: student.medical_notes,
          additional_info: student.additional_info,
        })
      )
    );

    settled.forEach((result, idx) => {
      const rowNum = i + idx + 1;
      if (result.status === 'fulfilled') {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${(result.reason as Error).message}`);
      }
    });
  }

  return NextResponse.json(results, { status: 201 });
});
```

- [ ] **Step 2: Run checks**

- [ ] **Step 3: Commit**

```bash
git add app/api/import/students/route.ts
git commit -m "perf(import): parallelize student creates in batches of 25, drop O(n^2) indexOf"
```

**Effort:** S

---

### Task 17: Drop client-side attendance date filter, use composite index

**Files:**
- Modify: `lib/firestore.ts`

- [ ] **Step 1: Replace `getSessionAttendance`**

```typescript
export async function getSessionAttendance(sessionId: string, date: string): Promise<Attendance[]> {
  const snap = await attendanceCol()
    .where('session_id', '==', sessionId)
    .where('date', '==', date)
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
}
```

- [ ] **Step 2: Run checks**

- [ ] **Step 3: Commit**

```bash
git add lib/firestore.ts
git commit -m "perf(firestore): use composite indexes for attendance queries instead of client filter"
```

**Effort:** M

---

## Phase E: Dependency hygiene

### Task 18: Move build-time deps to `devDependencies`

- [ ] **Step 1: Uninstall and reinstall**

```bash
npm uninstall autoprefixer postcss tailwindcss
npm install --save-dev autoprefixer@^10.4.16 postcss@^8.4.32 tailwindcss@^3.4.1
```

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): move autoprefixer/postcss/tailwindcss to devDependencies"
```

**Effort:** S

---

### Task 19: Remove unused `@opentelemetry/api`

- [ ] **Step 1: Verify no imports**

- [ ] **Step 2: Uninstall**

```bash
npm uninstall @opentelemetry/api
```

- [ ] **Step 3: Verify build + tests**

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): remove unused @opentelemetry/api"
```

**Effort:** S

---

### Task 20: Add `.nvmrc` and `engines`

- [ ] **Step 1: Create `.nvmrc` with content `20`**

- [ ] **Step 2: Add `engines` to `package.json`**

```json
{
  "engines": {
    "node": ">=20.0.0 <21.0.0"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .nvmrc package.json
git commit -m "chore: pin Node 20 via .nvmrc and engines (matches Firebase runtime)"
```

**Effort:** S

---

### Task 21: Husky decision

- [ ] **Step 1: Decide — adopt or abandon husky**

Recommended: adopt.

- [ ] **Step 2 (adopt path): Create `.husky/pre-commit`**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run lint && npm run typecheck && npm run test:unit
```

- [ ] **Step 3: Commit**

```bash
git add .husky package.json package-lock.json
git commit -m "chore: wire up husky pre-commit hook (lint + typecheck + unit tests)"
```

**Effort:** S

---

## Touched files index (for conflict detection)

```
.eslintrc.json                                          [Create: Task 1]
.husky/pre-commit                                       [Create: Task 21, optional]
.nvmrc                                                  [Create: Task 20]
BUILD_MANIFEST.txt                                      [Modify: Task 8]
HANDOFF.md                                              [Modify: Task 8]
README.md                                               [Modify: Task 8]
SETUP.md                                                [Modify: Task 8]
SETUP_CHECKLIST.md                                      [Modify: Task 8]
app/api/admin/login/route.ts                            [Modify: Task 4 (force-dynamic only; NOT withAuth)]
app/api/attendance/route.ts                             [Modify: Tasks 4, 10]
app/api/attendance/report/route.ts                      [Modify: Tasks 4, 9]
app/api/faculty/route.ts                                [Modify: Tasks 4, 10]
app/api/faculty/[id]/route.ts                           [Modify: Tasks 4, 10]
app/api/faculty/[id]/sessions/route.ts                  [Modify: Tasks 4, 10]
app/api/import/enrollments/route.ts                     [Modify: Tasks 4, 10]
app/api/import/faculty/route.ts                         [Modify: Tasks 4, 10]
app/api/import/sessions/route.ts                        [Modify: Tasks 4, 10]
app/api/import/students/route.ts                        [Modify: Tasks 4, 10, 16]
app/api/schedule/route.ts                               [Modify: Tasks 4, 10]
app/api/sessions/route.ts                               [Modify: Tasks 4, 10]
app/api/sessions/[id]/route.ts                          [Modify: Tasks 4, 10]
app/api/sessions/[id]/students/route.ts                 [Modify: Tasks 4, 10]
app/api/stats/route.ts                                  [Modify: Tasks 4, 10]
app/api/students/route.ts                               [Modify: Tasks 4, 10]
app/api/students/[id]/route.ts                          [Modify: Tasks 4, 10]
app/api/students/[id]/schedule/route.ts                 [Modify: Tasks 4, 10]
data/camp.db                                            [Delete: Task 7]
data/camp.db-shm                                        [Delete: Task 7]
data/camp.db-wal                                        [Delete: Task 7]
lib/date.ts                                             [Create: Task 11]
lib/db.ts                                               [Delete: Task 7]
lib/firebase-admin.ts                                   [Modify: Task 3]
lib/firestore.ts                                        [Modify: Tasks 2, 11, 12, 13, 14, 15, 17]
lib/types.ts                                            [Modify: Task 12]
lib/with-auth.ts                                        [Create: Task 9]
middleware.ts                                           [Delete: Task 6, pending security coordination]
package.json                                            [Modify: Tasks 5, 7, 18, 19, 20, 21]
package-lock.json                                       [Modify: Tasks 7, 18, 19, 21]
scripts/anonymize-and-seed.js                           [Delete: Task 7]
scripts/seed-remaining-attendance.js                    [Delete: Task 7]
scripts/seed-test-data.js                               [Delete: Task 7]
scripts/seed.ts                                         [Delete: Task 7]
scripts/test-with-emulator.sh                           [Create: Task 5]
tests/unit/lib/date.test.ts                             [Create: Task 11]
tests/unit/lib/with-auth.test.ts                        [Create: Task 9]
tsconfig.json                                           [Modify: Tasks 2, 7]
```

Conflict risk with other tracks:
- **HIGH conflict**: all 18 `app/api/**/route.ts` files (other tracks will also touch these). Mitigation: Phase A Task 4 + Phase C Task 10 land first; other tracks rebase.
- **HIGH conflict**: `lib/firestore.ts` (other tracks may add new queries). Mitigation: Phase D serializes within this track; other tracks coordinate merge windows.
- **MEDIUM conflict**: `package.json` / `package-lock.json`. Mitigation: single lockfile window for Phase E.
- **MEDIUM conflict**: `middleware.ts` (security track may own). Mitigation: explicit decision point in Task 6.

---

## Task effort summary

| # | Task | Effort | Phase |
|---|---|---|---|
| 1 | ESLint config | S | A |
| 2 | Strict TS + fallout | M | A |
| 3 | firebase-admin.ts typed getters | S | A |
| 4 | force-dynamic on all routes | S | A |
| 5 | Test harness fix | M | A |
| 6 | Delete middleware.ts | S | B |
| 7 | Delete dead SQLite layer | S | B |
| 8 | Remove SQLite doc refs | S | B |
| 9 | withAuth wrapper (TDD) + 1 route | M | C |
| 10 | Convert remaining 16 routes | L | C |
| 11 | lib/date.ts timezone fix | S | D |
| 12 | Type Promise<any> returns | M | D |
| 13 | Parallelize getFacultySessions | M | D |
| 14 | Parallelize getStudentSchedule | S | D |
| 15 | Parallelize getSessionStudentsFull | S | D |
| 16 | Fix import/students O(n²) | S | D |
| 17 | Drop client-side attendance filter | M | D |
| 18 | Move build deps to devDeps | S | E |
| 19 | Remove @opentelemetry/api | S | E |
| 20 | .nvmrc + engines | S | E |
| 21 | Husky decision | S | E |

**Totals:** 21 tasks. 14 S + 6 M + 1 L. Rough budget: ~3–4 developer-days sequentially, ~1.5–2 days with Phase B+D parallelization after Phase A lands.
