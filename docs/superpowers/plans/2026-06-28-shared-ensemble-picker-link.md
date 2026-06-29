# Shared Ensemble Picker Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared, revocable link that shows a picker of 10 ensembles (Bands 1–7, Orchestra 1–3) and deep-links each to its existing `/e/<token>` attendance page.

**Architecture:** Additive layer over the existing per-ensemble link system. A new `kind: 'selector'` doc in the `ensemble_links` collection is the shared credential; a public `/e/pick/<token>` page resolves each allowed ensemble to its current per-ensemble link at request time and links out to the untouched attendance flow. Core resolution logic is pure functions for testability.

**Tech Stack:** Next.js (App Router, sync route `params`), TypeScript, Firestore Admin SDK, Vitest (`environment: 'node'`, jsdom via per-file pragma), React Testing Library.

## Global Constraints

- Ensemble list is FIXED, Jazz excluded — exactly these 10 stored strings, verbatim: `Band 1`, `Band 2`, `Band 3`, `Band 4`, `Band 5 HS/MS`, `Band 6 MS`, `Band 7 MS`, `Orchestra 1`, `Orchestra 2`, `Orchestra 3`.
- The selector token is the only credential; unknown/revoked/non-selector tokens → uniform 404 `{ error: 'This link is no longer valid.' }` (no enumeration), matching `app/api/e/[token]/route.ts`.
- Public routes are rate-limited per IP via `checkRateLimit`/`getClientIp` (key prefix `e:` shared with the attendance route).
- The attendance/submit/export/period-rollover path MUST NOT change. The picker only hands out tokens that already exist.
- Route handlers use the project's synchronous `params` signature: `{ params }: { params: { token: string } }`.
- Tokens are `randomBytes(16).toString('hex')`.
- Unit test command: `npm test` (= `vitest run tests/unit/`). Typecheck: `npm run typecheck`. Lint: `npm run lint`. Build: `npm run build`.

---

### Task 1: Picker library — constant, types, pure resolvers, issue/validate/resolve

**Files:**
- Modify: `lib/ensemble-links.ts`
- Test: `tests/unit/lib/ensemble-picker.test.ts` (create)

**Interfaces:**
- Consumes: existing `EnsembleLink`, `issueEnsembleLink`, `listEnsembles`, `adminDb`, `randomBytes`, `ENSEMBLE_LINKS` constant (all already in `lib/ensemble-links.ts`).
- Produces:
  - `PICKER_ENSEMBLES: readonly string[]`
  - `interface SelectorLink { token: string; allowed: string[]; label: string | null; created_at: string; revoked: boolean }`
  - `interface PickerItem { ensemble: string; token: string; count: number }`
  - `pickCurrentEnsembleLink(links: EnsembleLink[], ensemble: string): EnsembleLink | null`
  - `buildPickerItems(allowed: string[], links: EnsembleLink[], countByEnsemble: Map<string, number>): PickerItem[]`
  - `validateSelectorToken(token: string): Promise<{ allowed: string[]; label: string | null } | null>`
  - `issueSelectorLink(label: string | null, now?: Date): Promise<{ token: string; url: string }>`
  - `resolvePickerTargets(token: string): Promise<PickerItem[] | null>`
  - `listSelectorLinks(): Promise<SelectorLink[]>`
  - `listEnsembleLinks()` is narrowed to exclude selector docs.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/ensemble-picker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory Firestore stand-in: collection → (docId → data).
const store = vi.hoisted(() => ({ data: new Map<string, Map<string, Record<string, unknown>>>() }));
function coll(name: string) {
  if (!store.data.has(name)) store.data.set(name, new Map());
  return store.data.get(name)!;
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        const realId = id ?? `auto_${coll(name).size}`;
        return {
          id: realId,
          get: async () => ({ exists: coll(name).has(realId), data: () => coll(name).get(realId) }),
          set: async (v: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const cur = coll(name).get(realId) ?? {};
            coll(name).set(realId, opts?.merge ? { ...cur, ...v } : v);
          },
        };
      },
      get: async () => ({ docs: [...coll(name).entries()].map(([id, v]) => ({ id, data: () => v })) }),
    }),
  },
}));

import {
  PICKER_ENSEMBLES,
  pickCurrentEnsembleLink,
  buildPickerItems,
  validateSelectorToken,
  issueSelectorLink,
  resolvePickerTargets,
  listEnsembleLinks,
  listSelectorLinks,
  type EnsembleLink,
} from '@/lib/ensemble-links';

const link = (over: Partial<EnsembleLink>): EnsembleLink => ({
  token: 't', ensemble: 'Band 1', label: null, created_at: '2026-06-01T00:00:00.000Z', revoked: false, ...over,
});

beforeEach(() => store.data.clear());

describe('PICKER_ENSEMBLES', () => {
  it('is the fixed 10, Jazz excluded', () => {
    expect(PICKER_ENSEMBLES).toEqual([
      'Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5 HS/MS', 'Band 6 MS', 'Band 7 MS',
      'Orchestra 1', 'Orchestra 2', 'Orchestra 3',
    ]);
    expect(PICKER_ENSEMBLES).not.toContain('Jazz 1');
  });
});

describe('pickCurrentEnsembleLink', () => {
  it('returns the most recent non-revoked link for the ensemble', () => {
    const links = [
      link({ token: 'a', ensemble: 'Band 1', created_at: '2026-06-01T00:00:00.000Z' }),
      link({ token: 'b', ensemble: 'Band 1', created_at: '2026-06-05T00:00:00.000Z' }),
      link({ token: 'c', ensemble: 'Band 2', created_at: '2026-06-09T00:00:00.000Z' }),
    ];
    expect(pickCurrentEnsembleLink(links, 'Band 1')?.token).toBe('b');
  });
  it('ignores revoked and returns null when none live', () => {
    const links = [link({ token: 'a', ensemble: 'Band 1', revoked: true })];
    expect(pickCurrentEnsembleLink(links, 'Band 1')).toBeNull();
    expect(pickCurrentEnsembleLink([], 'Band 1')).toBeNull();
  });
});

describe('buildPickerItems', () => {
  it('keeps allowed order, attaches token + count, omits ensembles with no live link', () => {
    const links = [
      link({ token: 'b1', ensemble: 'Band 1' }),
      link({ token: 'o1', ensemble: 'Orchestra 1' }),
    ];
    const counts = new Map([['Band 1', 73], ['Orchestra 1', 37]]);
    const items = buildPickerItems(['Band 1', 'Band 2', 'Orchestra 1'], links, counts);
    expect(items).toEqual([
      { ensemble: 'Band 1', token: 'b1', count: 73 },
      { ensemble: 'Orchestra 1', token: 'o1', count: 37 },
    ]);
  });
});

describe('validateSelectorToken', () => {
  it('accepts a non-revoked selector doc, rejects others', async () => {
    coll('ensemble_links').set('sel', { kind: 'selector', allowed: ['Band 1'], label: 'x', revoked: false, created_at: 'z' });
    coll('ensemble_links').set('rev', { kind: 'selector', allowed: ['Band 1'], revoked: true, created_at: 'z' });
    coll('ensemble_links').set('ens', { ensemble: 'Band 1', revoked: false, created_at: 'z' });
    expect(await validateSelectorToken('sel')).toEqual({ allowed: ['Band 1'], label: 'x' });
    expect(await validateSelectorToken('rev')).toBeNull();
    expect(await validateSelectorToken('ens')).toBeNull();
    expect(await validateSelectorToken('missing')).toBeNull();
  });
});

describe('issueSelectorLink + resolvePickerTargets (round trip)', () => {
  beforeEach(() => {
    // roster counts via listEnsembles (reads `students`)
    coll('students').set('s1', { ensemble: 'Band 1' });
    coll('students').set('s2', { ensemble: 'Orchestra 1' });
    coll('students').set('s3', { ensemble: 'Jazz 1' });
  });
  it('ensures a live link per offered ensemble and resolves 10 items, no Jazz', async () => {
    const { token, url } = await issueSelectorLink('Front desk');
    expect(url).toBe(`/e/pick/${token}`);
    // selector doc is not counted as a per-ensemble link
    expect((await listEnsembleLinks()).every((l) => l.ensemble !== undefined)).toBe(true);
    expect((await listSelectorLinks()).map((s) => s.token)).toContain(token);

    const items = await resolvePickerTargets(token);
    expect(items).not.toBeNull();
    expect(items!.map((i) => i.ensemble)).toEqual([...PICKER_ENSEMBLES]);
    expect(items!.every((i) => typeof i.token === 'string' && i.token.length > 0)).toBe(true);
    expect(items!.find((i) => i.ensemble === 'Band 1')!.count).toBe(1);
    expect(items!.some((i) => i.ensemble.startsWith('Jazz'))).toBe(false);
  });
  it('resolvePickerTargets returns null for a non-selector token', async () => {
    coll('ensemble_links').set('ens', { ensemble: 'Band 1', revoked: false, created_at: 'z' });
    expect(await resolvePickerTargets('ens')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lib/ensemble-picker.test.ts`
Expected: FAIL — `PICKER_ENSEMBLES`, `pickCurrentEnsembleLink`, etc. are not exported.

- [ ] **Step 3: Write minimal implementation**

In `lib/ensemble-links.ts`, add after the existing `EnsembleLink` interface and constants:

```ts
/** Ensembles offered by the shared picker link. Jazz is intentionally excluded.
 * Single source of truth for the fixed list (stored names, verbatim). */
export const PICKER_ENSEMBLES = [
  'Band 1', 'Band 2', 'Band 3', 'Band 4',
  'Band 5 HS/MS', 'Band 6 MS', 'Band 7 MS',
  'Orchestra 1', 'Orchestra 2', 'Orchestra 3',
] as const;

export interface SelectorLink {
  token: string;
  allowed: string[];
  label: string | null;
  created_at: string;
  revoked: boolean;
}

export interface PickerItem {
  ensemble: string;
  token: string; // the current per-ensemble /e/<token> to deep-link to
  count: number;
}

/** Most-recently-created non-revoked per-ensemble link for `ensemble`, or null. */
export function pickCurrentEnsembleLink(
  links: EnsembleLink[],
  ensemble: string
): EnsembleLink | null {
  const live = links.filter((l) => l.ensemble === ensemble && !l.revoked);
  if (live.length === 0) return null;
  return live.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}

/** Build picker items for `allowed`, resolving each to its current live link +
 * roster count. Ensembles with no live link are omitted (defensive). */
export function buildPickerItems(
  allowed: string[],
  links: EnsembleLink[],
  countByEnsemble: Map<string, number>
): PickerItem[] {
  const items: PickerItem[] = [];
  for (const ensemble of allowed) {
    const link = pickCurrentEnsembleLink(links, ensemble);
    if (!link) continue;
    items.push({ ensemble, token: link.token, count: countByEnsemble.get(ensemble) ?? 0 });
  }
  return items;
}

/** Selector links only (the shared picker credentials). */
export async function listSelectorLinks(): Promise<SelectorLink[]> {
  const snap = await adminDb.collection(ENSEMBLE_LINKS).get();
  return snap.docs
    .map((d) => ({ token: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((d) => (d as { kind?: string }).kind === 'selector')
    .map((d) => {
      const x = d as { token: string; allowed?: string[]; label?: string | null; created_at?: string; revoked?: boolean };
      return {
        token: x.token,
        allowed: Array.isArray(x.allowed) ? x.allowed : [],
        label: x.label ?? null,
        created_at: x.created_at ?? '',
        revoked: Boolean(x.revoked),
      };
    });
}

/** Resolve a selector token to its allowed ensembles, enforcing validity.
 * Uniform-null for unknown/revoked/non-selector. */
export async function validateSelectorToken(
  token: string
): Promise<{ allowed: string[]; label: string | null } | null> {
  if (!token) return null;
  const doc = await adminDb.collection(ENSEMBLE_LINKS).doc(token).get();
  if (!doc.exists) return null;
  const d = doc.data() as { kind?: string; allowed?: string[]; label?: string | null; revoked?: boolean };
  if (d.kind !== 'selector' || d.revoked || !Array.isArray(d.allowed)) return null;
  return { allowed: d.allowed, label: d.label ?? null };
}

/** Create a shared picker link. Ensures every offered ensemble has a live
 * per-ensemble link (reuse latest, else issue), then writes the selector doc. */
export async function issueSelectorLink(
  label: string | null,
  now: Date = new Date()
): Promise<{ token: string; url: string }> {
  const existing = await listEnsembleLinks();
  for (const ensemble of PICKER_ENSEMBLES) {
    if (!pickCurrentEnsembleLink(existing, ensemble)) {
      await issueEnsembleLink(ensemble, null, now);
    }
  }
  const token = randomBytes(16).toString('hex');
  await adminDb.collection(ENSEMBLE_LINKS).doc(token).set({
    kind: 'selector',
    allowed: [...PICKER_ENSEMBLES],
    label: label ?? null,
    created_at: now.toISOString(),
    revoked: false,
  });
  return { token, url: `/e/pick/${token}` };
}

/** Validate a selector token and resolve its picker items, or null. */
export async function resolvePickerTargets(token: string): Promise<PickerItem[] | null> {
  const v = await validateSelectorToken(token);
  if (!v) return null;
  const [links, ensembles] = await Promise.all([listEnsembleLinks(), listEnsembles()]);
  const countBy = new Map(ensembles.map((e) => [e.ensemble, e.count]));
  return buildPickerItems(v.allowed, links, countBy);
}
```

Then narrow the existing `listEnsembleLinks` so selector docs never leak into the per-ensemble list. Replace its body:

```ts
export async function listEnsembleLinks(): Promise<EnsembleLink[]> {
  const snap = await adminDb.collection(ENSEMBLE_LINKS).get();
  return snap.docs
    .map((d) => ({ token: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((d) => typeof (d as { ensemble?: unknown }).ensemble === 'string' && (d as { kind?: string }).kind !== 'selector')
    .map((d) => {
      const x = d as EnsembleLink & { kind?: string };
      return { token: x.token, ensemble: x.ensemble, label: x.label ?? null, created_at: x.created_at, revoked: Boolean(x.revoked) };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/lib/ensemble-picker.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/ensemble-links.ts tests/unit/lib/ensemble-picker.test.ts
git commit -m "feat(e): picker link library — selector docs + target resolution"
```

---

### Task 2: Public pick API route

**Files:**
- Create: `app/api/e/pick/[token]/route.ts`
- Test: `tests/unit/api/e-pick-route.test.ts` (create)

**Interfaces:**
- Consumes: `resolvePickerTargets(token)` (Task 1), `checkRateLimit`/`getClientIp` from `@/lib/rate-limit`.
- Produces: `GET(request, { params })` → `{ items: PickerItem[] }` (200) | uniform 404 | 429.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/api/e-pick-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  resolvePickerTargets: vi.fn(),
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('@/lib/ensemble-links', () => ({ resolvePickerTargets: h.resolvePickerTargets }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: h.checkRateLimit, getClientIp: h.getClientIp }));

import { GET } from '@/app/api/e/pick/[token]/route';

const req = () => ({ headers: new Headers(), url: 'http://x/api/e/pick/tok' }) as unknown as NextRequest;

beforeEach(() => {
  h.resolvePickerTargets.mockReset();
  h.checkRateLimit.mockReset().mockReturnValue(true);
});

describe('GET /api/e/pick/[token]', () => {
  it('returns items on a valid selector token', async () => {
    h.resolvePickerTargets.mockResolvedValue([{ ensemble: 'Band 1', token: 'b1', count: 73 }]);
    const res = await GET(req(), { params: { token: 'tok' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ ensemble: 'Band 1', token: 'b1', count: 73 }] });
  });
  it('uniform 404 when resolver returns null (unknown/revoked/non-selector)', async () => {
    h.resolvePickerTargets.mockResolvedValue(null);
    const res = await GET(req(), { params: { token: 'bad' } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'This link is no longer valid.' });
  });
  it('429 when rate-limited', async () => {
    h.checkRateLimit.mockReturnValue(false);
    const res = await GET(req(), { params: { token: 'tok' } });
    expect(res.status).toBe(429);
    expect(h.resolvePickerTargets).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/api/e-pick-route.test.ts`
Expected: FAIL — cannot import `@/app/api/e/pick/[token]/route`.

- [ ] **Step 3: Write minimal implementation**

Create `app/api/e/pick/[token]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { resolvePickerTargets } from '@/lib/ensemble-links';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public shared-picker data (no auth, token-gated). Validates the token is a
 * non-revoked selector link and returns each offered ensemble resolved to its
 * current per-ensemble `/e/<token>` plus roster count. Unknown / revoked /
 * non-selector tokens yield a uniform 404 (no enumeration). Rate-limited per IP.
 */
const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const items = await resolvePickerTargets(params.token);
  if (!items) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  return NextResponse.json({ items });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/api/e-pick-route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/e/pick/[token]/route.ts tests/unit/api/e-pick-route.test.ts
git commit -m "feat(e): public /api/e/pick/[token] route"
```

---

### Task 3: Public picker page

**Files:**
- Create: `app/e/pick/[token]/page.tsx`
- Test: `tests/unit/app/e-pick-page.test.tsx` (create)

**Interfaces:**
- Consumes: `GET /api/e/pick/<token>` (Task 2) via `fetch`; `useParams` from `next/navigation`.
- Produces: default-exported client component `EnsemblePickerPage`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/e-pick-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useParams: () => ({ token: 'tok' }) }));

import EnsemblePickerPage from '@/app/e/pick/[token]/page';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('EnsemblePickerPage', () => {
  it('renders a button per resolved ensemble linking to /e/<token>', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ ensemble: 'Band 1', token: 'b1', count: 73 }, { ensemble: 'Orchestra 1', token: 'o1', count: 37 }] }),
    });
    render(<EnsemblePickerPage />);
    await waitFor(() => expect(screen.getByText('Band 1')).toBeTruthy());
    const band = screen.getByText('Band 1').closest('a') as HTMLAnchorElement;
    expect(band.getAttribute('href')).toBe('/e/b1');
    expect(screen.getByText('Orchestra 1').closest('a')!.getAttribute('href')).toBe('/e/o1');
  });
  it('shows the inactive screen on an invalid token', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<EnsemblePickerPage />);
    await waitFor(() => expect(screen.getByText('This link is no longer active')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/app/e-pick-page.test.tsx`
Expected: FAIL — cannot import `@/app/e/pick/[token]/page`.

- [ ] **Step 3: Write minimal implementation**

Create `app/e/pick/[token]/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PickerItem {
  ensemble: string;
  token: string;
  count: number;
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; items: PickerItem[] };

/**
 * Shared picker page. One link to hand out: choose an ensemble, then jump to
 * that ensemble's existing `/e/<token>` attendance page. A `?now=HH:MM` test
 * override on this URL is forwarded onto the per-ensemble link.
 */
export default function EnsemblePickerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<State>({ kind: 'loading' });

  const nowQuery =
    typeof window !== 'undefined' && /[?&]now=\d{1,2}:\d{2}/.test(window.location.search)
      ? `?now=${new URLSearchParams(window.location.search).get('now')}`
      : '';

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/e/pick/${token}`);
      if (!res.ok) {
        setState({ kind: 'invalid' });
        return;
      }
      const data = (await res.json()) as { items: PickerItem[] };
      setState({ kind: 'ready', items: data.items ?? [] });
    } catch {
      setState({ kind: 'invalid' });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === 'loading') {
    return <main className="mx-auto max-w-md p-6 text-center text-sm text-[var(--text-3)]">Loading…</main>;
  }
  if (state.kind === 'invalid') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--text)]">This link is no longer active</h1>
        <p className="text-sm text-[var(--text-2)]">Please ask the camp office for a new attendance link.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold text-[var(--text)]">Take attendance</h1>
      <p className="text-sm text-[var(--text-2)]">Choose your ensemble.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {state.items.map((it) => (
          <li key={it.ensemble}>
            <a
              href={`/e/${it.token}${nowQuery}`}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface)] px-4 py-3 font-semibold text-[var(--text)]"
            >
              <span>{it.ensemble}</span>
              <span className="text-xs text-[var(--text-3)]">{it.count} students</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/app/e-pick-page.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/e/pick/[token]/page.tsx tests/unit/app/e-pick-page.test.tsx
git commit -m "feat(e): shared picker page"
```

---

### Task 4: Admin endpoint — issue + list selector links

**Files:**
- Modify: `app/api/admin/ensemble-links/route.ts`
- Test: `tests/unit/api/admin-ensemble-links-selector.test.ts` (create)

**Interfaces:**
- Consumes: `issueSelectorLink`, `listSelectorLinks` (Task 1); existing `withAuth`, `issueEnsembleLink`, `listEnsembleLinks`, `listEnsembles`.
- Produces: `GET` now returns `{ ensembles, links, selectorLinks }`; `POST` with `{ kind: 'selector', label? }` returns `{ token, url }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/api/admin-ensemble-links-selector.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  issueEnsembleLink: vi.fn(),
  issueSelectorLink: vi.fn(),
  listEnsembleLinks: vi.fn(async () => []),
  listSelectorLinks: vi.fn(async () => [{ token: 'sel', allowed: [], label: null, created_at: 'z', revoked: false }]),
  listEnsembles: vi.fn(async () => [{ ensemble: 'Band 1', count: 73 }]),
}));
// withAuth: pass the handler straight through (auth covered elsewhere).
vi.mock('@/lib/with-auth', () => ({ withAuth: (_role: string, fn: unknown) => fn }));
vi.mock('@/lib/ensemble-links', () => ({
  issueEnsembleLink: h.issueEnsembleLink,
  issueSelectorLink: h.issueSelectorLink,
  listEnsembleLinks: h.listEnsembleLinks,
  listSelectorLinks: h.listSelectorLinks,
  listEnsembles: h.listEnsembles,
}));

import { GET, POST } from '@/app/api/admin/ensemble-links/route';

const post = (body: unknown) => ({ json: async () => body }) as unknown as Request;

beforeEach(() => {
  h.issueSelectorLink.mockReset().mockResolvedValue({ token: 'newsel', url: '/e/pick/newsel' });
  h.issueEnsembleLink.mockReset().mockResolvedValue({ token: 'e1', url: '/e/e1', ensemble: 'Band 1' });
});

describe('admin ensemble-links selector support', () => {
  it('GET includes selectorLinks', async () => {
    const res = await (GET as unknown as (r: Request) => Promise<Response>)({} as Request);
    const body = await res.json();
    expect(body.selectorLinks).toEqual([{ token: 'sel', allowed: [], label: null, created_at: 'z', revoked: false }]);
  });
  it('POST kind=selector issues a picker link', async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(post({ kind: 'selector', label: 'Front desk' }));
    expect(await res.json()).toEqual({ token: 'newsel', url: '/e/pick/newsel' });
    expect(h.issueSelectorLink).toHaveBeenCalledWith('Front desk');
    expect(h.issueEnsembleLink).not.toHaveBeenCalled();
  });
  it('POST without kind still issues a per-ensemble link', async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(post({ ensemble: 'Band 1' }));
    expect(await res.json()).toEqual({ token: 'e1', url: '/e/e1', ensemble: 'Band 1' });
    expect(h.issueEnsembleLink).toHaveBeenCalled();
    expect(h.issueSelectorLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/api/admin-ensemble-links-selector.test.ts`
Expected: FAIL — `GET` response lacks `selectorLinks`; `issueSelectorLink` import missing.

- [ ] **Step 3: Write minimal implementation**

Edit `app/api/admin/ensemble-links/route.ts`. Update the import line and both handlers:

```ts
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import {
  issueEnsembleLink,
  issueSelectorLink,
  listEnsembleLinks,
  listEnsembles,
  listSelectorLinks,
} from '@/lib/ensemble-links';

export const dynamic = 'force-dynamic';

/**
 * Manage open attendance links. super_admin only. GET returns the ensembles
 * (from the roster), the per-ensemble links, and the shared picker (selector)
 * links. POST issues a per-ensemble link, or a shared picker link when
 * `{ kind: 'selector' }`.
 */
export const GET = withAuth('super_admin', async () => {
  const [ensembles, links, selectorLinks] = await Promise.all([
    listEnsembles(),
    listEnsembleLinks(),
    listSelectorLinks(),
  ]);
  return NextResponse.json({ ensembles, links, selectorLinks });
});

export const POST = withAuth('super_admin', async (request) => {
  const body = (await request.json().catch(() => null)) as {
    ensemble?: unknown;
    label?: unknown;
    kind?: unknown;
  } | null;
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null;

  if (body?.kind === 'selector') {
    const link = await issueSelectorLink(label);
    return NextResponse.json(link);
  }

  const ensemble = typeof body?.ensemble === 'string' ? body.ensemble.trim() : '';
  if (!ensemble) {
    return NextResponse.json({ error: 'ensemble required' }, { status: 400 });
  }
  const link = await issueEnsembleLink(ensemble, label);
  return NextResponse.json(link);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/api/admin-ensemble-links-selector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/ensemble-links/route.ts tests/unit/api/admin-ensemble-links-selector.test.ts
git commit -m "feat(admin): issue + list shared picker links"
```

---

### Task 5: Admin UI — shared picker link block

**Files:**
- Modify: `app/admin/settings/EnsembleLinksSection.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/ensemble-links` now returns `selectorLinks`; `POST { kind: 'selector' }`; existing revoke via `DELETE /api/admin/ensemble-links/<token>` (works on any token).
- Produces: UI only. No new exports.

- [ ] **Step 1: Add selector state, fetch, create, and render block**

In `EnsembleLinksSection.tsx`:

(a) Add a `SelectorLink` interface next to `EnsembleLink`:

```ts
interface SelectorLink {
  token: string;
  allowed: string[];
  label: string | null;
  created_at: string;
  revoked: boolean;
}
```

(b) Add state: after `const [links, setLinks] = useState<EnsembleLink[]>([]);` add

```ts
  const [selectorLinks, setSelectorLinks] = useState<SelectorLink[]>([]);
```

(c) In `refresh`, widen the parse and set selector links. Replace the `data` destructure block with:

```ts
      const data = (await res.json()) as { ensembles: EnsembleInfo[]; links: EnsembleLink[]; selectorLinks?: SelectorLink[] };
      setEnsembles(data.ensembles ?? []);
      setLinks(data.links ?? []);
      setSelectorLinks(data.selectorLinks ?? []);
```

(d) Add a creator alongside `generate`:

```ts
  async function generatePicker() {
    setBusy('__picker__');
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/ensemble-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'selector' }),
      });
      if (!res.ok) {
        setError(`Could not create picker link (${res.status})`);
        return;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
```

(e) Make `copy` handle both URL shapes by passing the full path. Change its signature:

```ts
  async function copy(token: string, path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
    } catch {
      setError('Copy failed — select the link manually.');
    }
  }
```

Update the existing per-ensemble copy button call from `onClick={() => copy(l.token)}` to `onClick={() => copy(l.token, `/e/${l.token}`)}`.

(f) Render the picker block immediately after the opening `<p>…</p>` description, before `{error && …}`:

```tsx
      <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--glass-border)] p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--text)]">Shared picker link</span>
          <button
            type="button"
            onClick={generatePicker}
            disabled={busy === '__picker__'}
            className="camp-btn-outline px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy === '__picker__' ? 'Creating…' : '+ New picker link'}
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          One link for all ensembles (Bands 1–7, Orchestra 1–3). Whoever has it picks an ensemble, then takes
          attendance. Revoke to disable.
        </p>
        {selectorLinks.filter((s) => !s.revoked).length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {selectorLinks.filter((s) => !s.revoked).map((s) => (
              <li key={s.token} className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/e/pick/${s.token}`}
                  onFocus={(ev) => ev.currentTarget.select()}
                  className="flex-1 rounded border border-[var(--glass-border)] bg-[var(--surface)] p-1 text-xs"
                />
                <button onClick={() => copy(s.token, `/e/pick/${s.token}`)} className="camp-btn-accent px-2 py-1 text-xs">
                  {copied === s.token ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => revoke(s.token)}
                  disabled={busy === s.token}
                  className="camp-btn-danger px-2 py-1 text-xs disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add app/admin/settings/EnsembleLinksSection.tsx
git commit -m "feat(admin): shared picker link UI in ensemble links section"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Lint + typecheck + full unit suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint clean, typecheck clean, ALL unit tests pass (existing + the 4 new files). Confirm no existing test regressed (especially `tests/unit/lib/ensemble-attendance.test.ts` and any test asserting `listEnsembleLinks` shape).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds; `/e/pick/[token]` and `/api/e/pick/[token]` appear in the route manifest output.

- [ ] **Step 3: Manual smoke (local), document result**

Run `npm run dev`, then as a super_admin:
1. Settings → Ensemble Attendance Links → "New picker link" → confirm a `/e/pick/<token>` URL appears and copies.
2. Open `/e/pick/<token>` → confirm 10 buttons (Bands 1–7, Orchestra 1–3, NO Jazz) with counts.
3. Tap one → lands on that ensemble's `/e/<token>` page (existing attendance UI).
4. Open `/e/pick/<token>?now=10:20` → tap an ensemble → confirm `?now=10:20` is carried onto the attendance page (live rehearsal shows).
5. Revoke the picker link → reload `/e/pick/<token>` → "This link is no longer active".
6. Confirm a plain per-ensemble `/e/<token>` still works unchanged.

Record pass/fail for each in the final report. (If David has not seeded a local Firestore, this manual step may be deferred to the deployed site after push; note that explicitly rather than claiming it passed.)

---

## Self-Review

**Spec coverage:**
- One shared credential, 10 fixed ensembles, Jazz excluded → Task 1 `PICKER_ENSEMBLES` + tests. ✓
- Additive, attendance path untouched → no edits to `/e/[token]` page, submit, export; picker only deep-links. ✓
- Selector link model in `ensemble_links` → Task 1. ✓
- Ensure live per-ensemble link at creation → `issueSelectorLink`. ✓
- Public `GET /api/e/pick/[token]` + uniform 404 + rate limit → Task 2. ✓
- Public picker page + `?now=` forwarding + inactive screen → Task 3. ✓
- Admin create + list + revoke → Tasks 4, 5. ✓
- Selector token rejected by `/api/e/[token]` → already true (`validateEnsembleToken` returns null with no `ensemble`); covered implicitly and asserted via `resolvePickerTargets` rejecting non-selector + `listEnsembleLinks` narrowing. Added an explicit note; no code change needed there.
- Testing list (creation ensures 10, pick returns 10 ordered, excludes Jazz, unknown/revoked → 404, non-selector not accepted, page smoke) → Tasks 1–3 tests. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `PickerItem`/`SelectorLink`/`EnsembleLink` shapes are identical across Tasks 1–5; `resolvePickerTargets` return type (`PickerItem[] | null`) matches route usage; `copy(token, path)` signature updated at both call sites; `issueSelectorLink(label)` called with the single `label` arg in Task 4 test and route.
