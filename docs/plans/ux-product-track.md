# UX / Product Track Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix P0 correctness bugs in the teacher and admin interfaces, build the missing admin student-detail modal, harden attendance save paths, and add a Settings page that replaces hardcoded camp dates with a real yearly-config/rollover system and a real file-based import pipeline.

**Architecture:** Introduce a single `lib/camp-config.ts` module that loads the active camp from `config/active_camp` in Firestore and exposes `getCampConfig()`, `dayKeyToDate()`, `todayKey()`, and `getCurrentCampDayAndPeriod()`. All client pages fetch this via a new `GET /api/config/camp` route on mount and hold it in a React context (`lib/camp-config-context.tsx`). Yearly archival uses a Firestore `camps/{year}` collection for historical snapshots plus a pointer doc `config/active_camp`. Import pipeline uses `papaparse` + `xlsx` (SheetJS) for parsing, with a column-mapping UI stage before commit.

**Tech Stack:** Next.js 14 App Router, React 18, Firestore (firebase-admin server, firebase client), TailwindCSS, Vitest + jsdom for unit tests, Playwright for e2e, `papaparse@^5`, `xlsx@^0.18` (new deps), `@testing-library/react@^16` + `@testing-library/jest-dom@^6` + `@testing-library/user-event@^14` (new dev deps, used with jsdom env in vitest).

---

## Assumptions (flag these for review)

1. **Active camp pointer:** single doc `config/active_camp` with `{ camp_id: string, year: number }`. The existing `config/camp` doc (used by `lib/auth.ts` `verifyTeacher`) is kept and extended with `year`, `start_date`, `end_date`, `timezone`, and `day_dates`. Rollover updates both docs atomically.
2. **Historical data:** after rollover, old attendance + enrollment docs are copied into `camps/{oldYear}/attendance/*` and `camps/{oldYear}/session_students/*`; live collections are emptied. Students and faculty are preserved in live collections (students may return next year). This means `attendance` / `session_students` are year-scoped de facto, while `students` / `faculty` / `periods` / `sessions` remain current. Flag: confirm with product before coding rollover.
3. **Settings page at `/admin/settings`.** Admin-only. Fields: `year`, `start_date`, `end_date`, `timezone` (default `America/Chicago`), `camp_code` (rotate button), list of `day_dates` auto-derived from start/end.
4. **Import rewrite:** supports `.csv` and `.xlsx`, single-sheet. Column mapping is persisted per import type in `localStorage` keyed `import.mapping.{type}` so admins don't re-map every run.
5. **Tardy auto-derivation is server-side** per handoff spec. The UI cycle becomes Unmarked → Present → Absent; tardiness is computed in `markAttendance` when `status === 'present'` and current wall-clock time exceeds the period `start_time` on the given date. This is a server-track change but also touches the teacher UI and is covered here because the cycle is in client code — coordinate with security cluster on the route.
6. **Offline queue** uses `localStorage` (`attendance.queue`) + `navigator.onLine` + `window.addEventListener('online', flush)`. No IndexedDB — YAGNI; the queue holds at most 644 × 10 = 6440 items × ~150 bytes = ~1 MB worst case, well under localStorage's 5 MB cap.

---

## File Structure

### Created
- `lib/camp-config.ts` — server helpers (`loadActiveCampServer`, `dayKeyToDate`, `getCampDayKeyForDate`)
- `lib/camp-config-client.ts` — client helpers (`CampConfigProvider`, `useCampConfig`, `useTodayCampDay`, `useCurrentPeriod`)
- `lib/date-utils.ts` — pure functions (`dayKeyToDate`, `dateToDayKey`, `isDateInCamp`, `formatDayLabel`)
- `lib/attendance-queue.ts` — offline queue (localStorage)
- `lib/import-parsers.ts` — `parseCSV(text)`, `parseXLSX(buffer)`, `normalizeRows(rows, mapping)`
- `lib/import-schemas.ts` — per-type field definitions for mapping UI
- `app/api/config/camp/route.ts` — `GET` returns active camp config (teacher role via camp-code OR admin; no PII); `PUT` admin only
- `app/api/config/camp-code/rotate/route.ts` — `POST` admin only
- `app/api/camps/rollover/route.ts` — `POST` admin only, performs archival
- `app/api/attendance/batch/route.ts` — `POST` admin+teacher, batch mark-all
- `app/admin/settings/page.tsx`
- `app/admin/dashboard/StudentDetailModal.tsx`
- `components/Modal.tsx` — reusable focus-trap/Escape/aria-modal wrapper
- `components/Toast.tsx` — simple toast provider
- `tests/unit/lib/date-utils.test.ts`
- `tests/unit/lib/import-parsers.test.ts`
- `tests/unit/lib/attendance-queue.test.ts`
- `tests/unit/components/Modal.test.tsx`
- `tests/unit/components/StudentDetailModal.test.tsx`
- `tests/integration/api/camp-config.test.ts`
- `tests/integration/api/attendance-batch.test.ts`
- `tests/integration/api/rollover.test.ts`
- `tests/e2e/settings-and-rollover.test.ts`

### Modified
- `lib/types.ts` — extend `CampConfig` with `start_date`, `end_date`, `timezone`
- `app/teacher/[id]/page.tsx` — remove hardcoded dates, use context, highlight today
- `app/teacher/[id]/session/[sessionId]/page.tsx` — 2-state cycle, optimistic save, queue, sticky bottom CTA, a11y, collapsing header
- `app/admin/dashboard/page.tsx` — remove hardcoded dates, fix search to ALL students, mount StudentDetailModal, add instrument + dorm filters, today-aware default day
- `app/admin/data/students/page.tsx` — full-coverage edit modal, accessible, named delete confirm
- `app/admin/import/page.tsx` — file upload, parser selection, mapping step
- `app/admin/schedule/page.tsx` — period-columns × ensemble-rows grid
- `app/api/attendance/route.ts` — NOTE: security track also edits; coordinate merge
- `lib/firestore.ts` — add `getStudentsBySearch`, `getStudentScheduleForDate`, rollover helpers
- `app/layout.tsx` — wrap tree in `CampConfigProvider` + `ToastProvider`
- `package.json` — add `papaparse`, `xlsx`, `@testing-library/*`
- `vitest.config.ts` — add `jsdom` environment for `tests/unit/components/**`

---

## Phase 1 — Date/Config Foundation

Unblocks every other phase that depends on "today".

### Task 1: Add `lib/date-utils.ts` pure helpers

**Files:**
- Create: `lib/date-utils.ts`
- Test: `tests/unit/lib/date-utils.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/unit/lib/date-utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  dayKeyToDate, dateToDayKey, isDateInCamp, formatDayLabel,
} from '@/lib/date-utils';

const DAY_DATES = {
  M:  '2026-06-08',
  T:  '2026-06-09',
  W:  '2026-06-10',
  Th: '2026-06-11',
  F:  '2026-06-12',
  S:  '2026-06-13',
};

describe('date-utils', () => {
  it('dayKeyToDate returns ISO date for valid key', () => {
    expect(dayKeyToDate('W', DAY_DATES)).toBe('2026-06-10');
  });

  it('dayKeyToDate returns null for unknown key', () => {
    expect(dayKeyToDate('Z', DAY_DATES)).toBeNull();
  });

  it('dateToDayKey inverts dayKeyToDate', () => {
    expect(dateToDayKey('2026-06-10', DAY_DATES)).toBe('W');
  });

  it('dateToDayKey returns null when date is outside camp', () => {
    expect(dateToDayKey('2026-05-01', DAY_DATES)).toBeNull();
  });

  it('isDateInCamp true/false', () => {
    expect(isDateInCamp('2026-06-10', DAY_DATES)).toBe(true);
    expect(isDateInCamp('2026-07-01', DAY_DATES)).toBe(false);
  });

  it('formatDayLabel returns Mon/Tue/…', () => {
    expect(formatDayLabel('M')).toBe('Mon');
    expect(formatDayLabel('Th')).toBe('Thu');
  });
});
```

- [ ] **Step 2: Run and verify FAIL**

```
npm run test:unit -- tests/unit/lib/date-utils.test.ts
```
Expected: cannot find module `@/lib/date-utils`.

- [ ] **Step 3: Implement module**

```ts
// lib/date-utils.ts
export type DayKey = 'M' | 'T' | 'W' | 'Th' | 'F' | 'S';
export type DayDates = Partial<Record<DayKey, string>>;

const LABELS: Record<DayKey, string> = {
  M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', S: 'Sat',
};

export function dayKeyToDate(key: string, dayDates: DayDates): string | null {
  return (dayDates as Record<string, string>)[key] ?? null;
}

export function dateToDayKey(date: string, dayDates: DayDates): DayKey | null {
  for (const [k, v] of Object.entries(dayDates)) {
    if (v === date) return k as DayKey;
  }
  return null;
}

export function isDateInCamp(date: string, dayDates: DayDates): boolean {
  return Object.values(dayDates).includes(date);
}

export function formatDayLabel(key: string): string {
  return LABELS[key as DayKey] ?? key;
}

/** Today's local ISO date in a given timezone, e.g. "America/Chicago". */
export function todayIsoInTimezone(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now);
}
```

- [ ] **Step 4: Run test, verify PASS**

- [ ] **Step 5: Commit**

```
git add lib/date-utils.ts tests/unit/lib/date-utils.test.ts
git commit -m "feat(date-utils): add pure date/day-key helpers"
```

**Effort:** S

---

### Task 2: Extend `CampConfig` type and add server loader

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/camp-config.ts`

- [ ] **Step 1: Extend type**

```ts
export interface CampConfig {
  camp_id: string;
  camp_code: string;
  camp_year: number;
  start_date: string;
  end_date: string;
  timezone: string;
  day_dates: Record<string, string>;
}
```

- [ ] **Step 2: Implement server loader**

```ts
// lib/camp-config.ts
import { adminDb } from './firebase-admin';
import type { CampConfig } from './types';
import { todayIsoInTimezone, dateToDayKey } from './date-utils';

let _cache: { value: CampConfig; loadedAt: number } | null = null;
const TTL_MS = 30_000;

export async function loadActiveCampServer(force = false): Promise<CampConfig> {
  if (!force && _cache && Date.now() - _cache.loadedAt < TTL_MS) {
    return _cache.value;
  }
  const doc = await adminDb.collection('config').doc('camp').get();
  if (!doc.exists) throw new Error('config/camp missing — run initial Settings save');
  const data = doc.data() as CampConfig;
  _cache = { value: data, loadedAt: Date.now() };
  return data;
}

export function invalidateCampConfigCache() { _cache = null; }

export function getTodayDayKey(cfg: CampConfig, now: Date = new Date()): string | null {
  const today = todayIsoInTimezone(cfg.timezone, now);
  return dateToDayKey(today, cfg.day_dates);
}
```

- [ ] **Step 3: Commit**

```
git add lib/types.ts lib/camp-config.ts
git commit -m "feat(camp-config): extend CampConfig and add server loader"
```

**Effort:** S

---

### Task 3: Add `GET /api/config/camp` route

**Files:**
- Create: `app/api/config/camp/route.ts`
- Create: `tests/integration/api/camp-config.test.ts`

- [ ] **Step 1: Write failing integration test**

```ts
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch, anonFetch } from '../../setup/api-client';

describe('GET /api/config/camp', () => {
  it('returns config for teacher (with camp code)', async () => {
    const { status, data } = await teacherFetch('/api/config/camp');
    expect(status).toBe(200);
    expect(data).toMatchObject({
      camp_year: expect.any(Number),
      start_date: expect.any(String),
      end_date: expect.any(String),
      timezone: expect.any(String),
      day_dates: expect.any(Object),
    });
    expect(data).not.toHaveProperty('camp_code');
  });

  it('returns config + camp_code for admin', async () => {
    const { status, data } = await adminFetch('/api/config/camp');
    expect(status).toBe(200);
    expect(data.camp_code).toEqual(expect.any(String));
  });

  it('401 for anonymous', async () => {
    const { status } = await anonFetch('/api/config/camp');
    expect(status).toBe(401);
  });
});
```

- [ ] **Step 2: Add `anonFetch` helper if missing**

```ts
export async function anonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
```

- [ ] **Step 3: Run test, expect fail**

- [ ] **Step 4: Implement route**

```ts
// app/api/config/camp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCallerRole } from '@/lib/auth';
import { loadActiveCampServer } from '@/lib/camp-config';

export async function GET(request: NextRequest) {
  const role = await getCallerRole(request);
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cfg = await loadActiveCampServer();
  if (role === 'teacher') {
    const { camp_code, ...safe } = cfg;
    return NextResponse.json(safe);
  }
  return NextResponse.json(cfg);
}
```

- [ ] **Step 5: Run test, verify pass; commit**

```
git add app/api/config/camp/route.ts tests/integration/api/camp-config.test.ts tests/setup/api-client.ts
git commit -m "feat(api): add GET /api/config/camp with role-aware output"
```

**Effort:** S

---

### Task 4: Add client `CampConfigProvider` and hooks

**Files:**
- Create: `lib/camp-config-client.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement provider**

```tsx
// lib/camp-config-client.tsx
'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getCampCodeHeaders } from '@/lib/camp-code';
import { auth } from '@/lib/firebase';
import { dateToDayKey, todayIsoInTimezone } from '@/lib/date-utils';

export interface PublicCampConfig {
  camp_id: string;
  camp_year: number;
  start_date: string;
  end_date: string;
  timezone: string;
  day_dates: Record<string, string>;
}

interface Ctx {
  config: PublicCampConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CampConfigContext = createContext<Ctx | null>(null);

async function authHeaders(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (u) return { Authorization: `Bearer ${await u.getIdToken()}` };
  return getCampCodeHeaders();
}

export function CampConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicCampConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const res = await fetch('/api/config/camp', { headers: await authHeaders() });
      if (!res.ok) {
        setError(`config ${res.status}`);
        return;
      }
      setConfig(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <CampConfigContext.Provider value={{ config, loading, error, refresh }}>
      {children}
    </CampConfigContext.Provider>
  );
}

export function useCampConfig() {
  const ctx = useContext(CampConfigContext);
  if (!ctx) throw new Error('useCampConfig must be used inside CampConfigProvider');
  return ctx;
}

export function useTodayDayKey(): string | null {
  const { config } = useCampConfig();
  if (!config) return null;
  const today = todayIsoInTimezone(config.timezone);
  return dateToDayKey(today, config.day_dates);
}
```

- [ ] **Step 2: Wrap layout**

In `app/layout.tsx`:

```tsx
import { CampConfigProvider } from '@/lib/camp-config-client';
// ...
<CampConfigProvider>
  <AuthProvider>{children}</AuthProvider>
</CampConfigProvider>
```

- [ ] **Step 3: Commit**

```
git add lib/camp-config-client.tsx app/layout.tsx
git commit -m "feat(config): add CampConfigProvider + useTodayDayKey"
```

**Effort:** S

---

### Task 5: Replace hardcoded dates in teacher dashboard

**Files:**
- Modify: `app/teacher/[id]/page.tsx`

- [ ] **Step 1: Replace the `dayKeyToDate` block and `DAYS` constant**

```tsx
import { useCampConfig, useTodayDayKey } from '@/lib/camp-config-client';
import { dayKeyToDate, formatDayLabel } from '@/lib/date-utils';
```

Inside component:

```tsx
const { config, loading: cfgLoading } = useCampConfig();
const todayKey = useTodayDayKey();
const [selectedDay, setSelectedDay] = useState<string | null>(null);

useEffect(() => {
  if (config && selectedDay === null) {
    setSelectedDay(todayKey ?? Object.keys(config.day_dates)[0]);
  }
}, [config, todayKey, selectedDay]);
```

- [ ] **Step 2: Guard `fetchSessions` on config ready**

```tsx
async function fetchSessions() {
  if (!config || !selectedDay) return;
  const date = dayKeyToDate(selectedDay, config.day_dates);
  if (!date) return;
  const res = await fetch(`/api/faculty/${params.id}/sessions?date=${date}`, {
    headers: getCampCodeHeaders(),
  });
  // ...
}
```

- [ ] **Step 3: Render day buttons from config, highlight today**

```tsx
{config && Object.keys(config.day_dates).map((dayKey) => {
  const isToday = dayKey === todayKey;
  const isSelected = dayKey === selectedDay;
  return (
    <button
      key={dayKey}
      onClick={() => { setLoading(true); setSelectedDay(dayKey); }}
      aria-pressed={isSelected}
      aria-label={`${formatDayLabel(dayKey)}${isToday ? ' (today)' : ''}`}
      className={`flex-1 py-3 rounded-lg font-bold text-lg relative transition-all ${
        isSelected
          ? 'bg-camp-green text-white shadow-md'
          : 'bg-white text-camp-green border-2 border-camp-green hover:bg-green-50'
      }`}
    >
      {dayKey}
      {isToday && (
        <span
          className="absolute -top-1 -right-1 bg-camp-accent text-white text-[10px] px-1.5 py-0.5 rounded-full"
          aria-hidden="true"
        >today</span>
      )}
    </button>
  );
})}
```

- [ ] **Step 4: Commit**

```
git add app/teacher/[id]/page.tsx
git commit -m "fix(teacher): use dynamic camp config for dates + highlight today"
```

**Effort:** S

---

### Task 6: Replace hardcoded dates in teacher attendance page + admin dashboard

**Files:**
- Modify: `app/teacher/[id]/session/[sessionId]/page.tsx`
- Modify: `app/admin/dashboard/page.tsx`

Apply the same swap as Task 5 to both files — remove the local `DAYS` + `dayKeyToDate` blocks, use `useCampConfig`/`useTodayDayKey`, default `selectedDay` to `todayKey ?? 'M'`.

**Effort:** M

---

## Phase 2 — Attendance Save-Path Hardening

### Task 7: Toast provider + reusable `Modal` component

**Files:**
- Create: `components/Toast.tsx`
- Create: `components/Modal.tsx`
- Create: `tests/unit/components/Modal.test.tsx`
- Modify: `app/layout.tsx`
- Modify: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install test libs**

```
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Update `vitest.config.ts`:

```ts
test: {
  globals: true,
  environment: 'node',
  environmentMatchGlobs: [
    ['tests/unit/components/**', 'jsdom'],
    ['tests/unit/lib/camp-code.test.ts', 'jsdom'],
  ],
  setupFiles: ['./tests/setup/vitest.setup.ts'],
  include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  exclude: ['tests/e2e/**'],
},
```

- [ ] **Step 2: Failing Modal test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/Modal';

describe('Modal', () => {
  it('renders with role=dialog and aria-modal=true', () => {
    render(<Modal open onClose={() => {}} title="T"><p>body</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('T');
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">hi</Modal>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('focuses first focusable element on open', () => {
    render(
      <Modal open onClose={() => {}} title="T">
        <button>first</button>
        <button>second</button>
      </Modal>
    );
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('returns null when closed', () => {
    const { container } = render(<Modal open={false} onClose={() => {}} title="T">hi</Modal>);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Implement Modal**

```tsx
// components/Modal.tsx
'use client';
import { ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export function Modal({ open, title, onClose, children, size = 'lg' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab' && ref.current) {
        const nodes = Array.from(
          ref.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(n => !n.hasAttribute('disabled'));
        if (nodes.length === 0) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const sizeClass = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-lg shadow-xl p-6 w-full ${sizeClass} max-h-[90vh] overflow-y-auto`}
      >
        <h2 id={titleId} className="text-xl font-bold text-camp-green mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Toast provider**

```tsx
// components/Toast.tsx
'use client';
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

type Toast = { id: number; kind: 'info' | 'error' | 'success'; text: string };
const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, ...t }]);
    setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] space-y-2">
        {items.map(t => (
          <div key={t.id}
               className={`px-4 py-2 rounded shadow-md text-white ${
                 t.kind === 'error' ? 'bg-red-600' :
                 t.kind === 'success' ? 'bg-green-600' : 'bg-gray-800'
               }`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be inside ToastProvider');
  return c;
}
```

- [ ] **Step 5: Wire ToastProvider in `app/layout.tsx`**

- [ ] **Step 6: Run tests, commit**

**Effort:** M

---

### Task 8: Attendance offline queue

**Files:**
- Create: `lib/attendance-queue.ts`
- Create: `tests/unit/lib/attendance-queue.test.ts`

- [ ] **Step 1: Failing test** (see full test in appendix A of this file section — dedupe, enqueue, flush paths)

- [ ] **Step 2: Implement**

```ts
// lib/attendance-queue.ts
export interface AttendanceQueueItem {
  student_id: string;
  session_id: string;
  date: string;
  status: 'present' | 'absent' | 'tardy';
  queuedAt: number;
}

const KEY = 'attendance.queue.v1';

function read(): AttendanceQueueItem[] {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(items: AttendanceQueueItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}
function keyOf(i: AttendanceQueueItem) {
  return `${i.student_id}|${i.session_id}|${i.date}`;
}

export function enqueue(item: AttendanceQueueItem) {
  const items = read().filter(existing => keyOf(existing) !== keyOf(item));
  items.push(item);
  write(items);
}

export function peek(): AttendanceQueueItem | undefined {
  return read()[0];
}

export function size(): number {
  return read().length;
}

export function clear(): void {
  write([]);
}

export async function flush(send: (i: AttendanceQueueItem) => Promise<boolean>): Promise<void> {
  let items = read();
  while (items.length > 0) {
    const head = items[0];
    const ok = await send(head);
    if (!ok) return;
    items = items.slice(1);
    write(items);
  }
}
```

- [ ] **Step 3: Commit**

**Effort:** S

---

### Task 9: Batch attendance API route

**Files:**
- Create: `app/api/attendance/batch/route.ts`
- Create: `tests/integration/api/attendance-batch.test.ts`
- Modify: `lib/firestore.ts` (add `markAttendanceBatch`)

**Cross-cluster note:** Security track edits `app/api/attendance/route.ts`. This task creates a NEW file — zero collision. The `markAttendance` helper in `lib/firestore.ts` IS shared; `markAttendanceBatch` must call the same shared validator security extracts into `lib/attendance-rules.ts`.

- [ ] **Step 1: Add batch helper to `lib/firestore.ts`** (groups by session_id, chunks of 400 for Firestore batch limit, pre-fetches students in parallel per chunk)

- [ ] **Step 2: Implement route**

```ts
// app/api/attendance/batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCallerRole } from '@/lib/auth';
import { markAttendanceBatch } from '@/lib/firestore';

const MAX_ITEMS = 1000;
const VALID_STATUSES = new Set(['present', 'absent', 'tardy']);

export async function POST(request: NextRequest) {
  const role = await getCallerRole(request);
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'items[] required and non-empty' }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `batch too large (max ${MAX_ITEMS})` }, { status: 413 });
  }
  for (const [i, it] of items.entries()) {
    if (!it.student_id || !it.session_id || !it.date || !VALID_STATUSES.has(it.status)) {
      return NextResponse.json({ error: `invalid item at index ${i}` }, { status: 400 });
    }
  }

  const markedBy = role === 'admin' ? 'admin' : 'teacher';
  const result = await markAttendanceBatch(items, markedBy);
  return NextResponse.json(result);
}
```

**Effort:** M

---

### Task 10: Rewrite teacher attendance UI (optimistic + queue + 2-state cycle + a11y)

**Files:**
- Modify: `app/teacher/[id]/session/[sessionId]/page.tsx`
- Modify: `app/api/attendance/route.ts` (add DELETE handler — see cross-cluster note)
- Modify: `app/globals.css` (collapse-on-scroll + sticky bottom CTA)

Core changes:
1. **2-state cycle** Unmarked → Present → Absent → Unmarked (drop Tardy from client cycle).
2. **Optimistic UI with retry + queue**: on POST failure, enqueue to localStorage and show toast "Offline — mark saved to retry queue." On `online` event, `flush()`.
3. **DELETE for unmark**: new handler on `app/api/attendance/route.ts`.
4. **Sticky bottom CTA** "Mark N Remaining Absent" (solid high-contrast), opens confirmation modal, uses `/api/attendance/batch`.
5. **Collapse-on-scroll header**: scroll listener toggles a class that hides day selector/counts.
6. **a11y**: `aria-pressed` + `aria-label` on student row buttons.
7. **Queue indicator** in header shows "N pending sync" badge.

**Cross-cluster:** UX DELETE handler lands first in an isolated PR; security rebases POST changes on top.

**Effort:** L

---

## Phase 3 — Student Detail Modal + Admin Search

### Task 11: Add search + schedule-for-date APIs

**Files:**
- Create: `app/api/students/search/route.ts` (admin-only, searches all students by name/instrument)
- Modify: `app/api/students/[id]/route.ts` (accept `?with_schedule=1&date=YYYY-MM-DD`)

**Effort:** S

---

### Task 12: Build `StudentDetailModal` component

**Files:**
- Create: `app/admin/dashboard/StudentDetailModal.tsx`
- Create: `tests/unit/components/StudentDetailModal.test.tsx`

Full profile with inline-edit on every field, medical notes in yellow banner, today's schedule with per-row attendance status.

**Effort:** M

---

### Task 13: Wire StudentDetailModal and fix search in admin dashboard

**Files:**
- Modify: `app/admin/dashboard/page.tsx`

1. Replace inline expand with modal opened by student-name click.
2. Fix search: add `/api/students/search` call that returns ALL students matching the query (not just records already in the absent list).
3. Add instrument + dorm building filters.

**Effort:** M

---

## Phase 4 — Settings Page

### Task 14: Extend config API — PUT + rotate camp code

**Files:**
- Modify: `app/api/config/camp/route.ts` (add PUT handler, admin-only)
- Create: `app/api/config/camp-code/rotate/route.ts` (admin-only, generates 8-char code)
- Modify: `lib/firestore.ts` (add `setCampConfig`, `rotateCampCode`)

**Effort:** S

---

### Task 15: `/admin/settings` page

**Files:**
- Create: `app/admin/settings/page.tsx`
- Modify: `app/admin/dashboard/page.tsx` (add Settings quicklink)
- Add: `deriveDayDates(startDate, endDate)` helper in `lib/date-utils.ts` (auto-generates M..S keys from date range)

Sections: Camp Identity (year, dates, timezone), Teacher Camp Code (rotate), Yearly Rollover (link to wizard).

**Effort:** M

---

## Phase 5 — Yearly Rollover

### Task 16: Rollover API

**Files:**
- Create: `app/api/camps/rollover/route.ts`
- Modify: `lib/firestore.ts` (add `performRollover`)
- Create: `tests/integration/api/rollover.test.ts`

`performRollover(opts)` archives `attendance/*` → `camps/{oldId}/attendance/*`, `session_students/*` → `camps/{oldId}/session_students/*`, clears live collections, updates `config/camp` to new year, sets `config/active_camp` pointer. Students, faculty, sessions, periods are preserved.

**Effort:** L

---

### Task 17: Rollover wizard UI

**Files:**
- Create: `app/admin/settings/rollover/page.tsx`

Input new year + dates, require typing `ROLLOVER 2027` to confirm, call the API, show archived counts.

**Effort:** M

---

## Phase 6 — Import Rewrite

### Task 18: Parsers and schemas

**Files:**
- Create: `lib/import-parsers.ts` (papaparse CSV + xlsx parser + `normalizeRows`)
- Create: `lib/import-schemas.ts` (field defs for students/faculty/sessions/enrollments)
- Create: `tests/unit/lib/import-parsers.test.ts`
- Modify: `package.json` (add `papaparse`, `xlsx`, `@types/papaparse`)

**Effort:** M

---

### Task 19: Rebuild `/admin/import` with file upload + mapping step

**Files:**
- Modify: `app/admin/import/page.tsx`

Flow: pick type → upload `.csv` or `.xlsx` file → auto-detect columns → column mapping UI with persistent localStorage → preview first 5 rows → import → show success/failure counts with error details.

**Effort:** L

---

## Phase 7 — Remaining Polish

### Task 20: Students edit modal — full coverage + a11y

**Files:**
- Modify: `app/admin/data/students/page.tsx`

Replace raw overlay with `Modal` component. Expose every student field (medical_notes, parent_*, email, chair_number, dorm_building, cell_phone, gender, preferred_name). Name delete confirmation (`Delete ${firstName} ${lastName}?`).

**Effort:** M

---

### Task 21: Schedule grid — periods × ensembles matrix

**Files:**
- Modify: `app/admin/schedule/page.tsx`

Rebuild layout so periods are rows and ensembles are columns, with cells showing session name, location, teacher.

**Effort:** M

---

### Task 22: E2E smoke for settings + rollover wizard

**Files:**
- Create: `tests/e2e/settings-and-rollover.test.ts`

Playwright smoke: admin login → Settings → save dates → verify day_dates preview visible.

**Effort:** S

---

## Dependencies (within track)

- **Phase 1** → **Phases 2, 3, 4, 6** (every UI touching dates imports from `lib/camp-config-client`).
- **Phase 2 Task 7 (Modal/Toast)** → **Task 10** (attendance confirm), **Task 12** (StudentDetailModal), **Task 17** (rollover wizard uses toast), **Task 20** (students edit modal).
- **Phase 4 Task 14** → **Phase 4 Task 15 Settings UI**, **Phase 5 Tasks 16–17 Rollover**.
- **Phase 6 Task 18 (parsers)** → **Task 19 (import page)**.
- **Task 11** (student search API) → **Task 13** (dashboard wire-up).
- Tasks 20, 21, 22 are fully independent after Phase 2.

## Cross-Cluster Dependencies

### Security track

1. **`app/api/attendance/route.ts` POST** — security validates `status`, derives `marked_by`, auto-sets `tardy` when `present` after period start. **Our track adds a `DELETE` handler (Task 10).** Land UX DELETE in an isolated PR first; security rebases on top. Both tracks agree: tardy-derivation logic lives in `lib/attendance-rules.ts` owned by security.

2. **`app/api/attendance/batch/route.ts`** — new file, no collision. Security must later add `validateAttendanceItem` calls; extract a shared helper and import from both routes.

3. **`lib/firestore.ts`** — append-only: `markAttendanceBatch`, `performRollover`, `setCampConfig`, `rotateCampCode`. Low collision risk. `markAttendanceBatch` should call the security track's future `validateAttendanceItem`.

4. **`lib/camp-code.ts`** — Task 14 rotates the code in Firestore. Security enforces stricter `verifyTeacher`. Both writes go through `config/camp` — no collision.

### Code-health track

1. **`tsconfig.json strict: true`** — all new code must be strict-clean. Specifically `lib/camp-config.ts`, `StudentDetailModal`, `lib/firestore.ts` additions (use `satisfies`, avoid `any[]` returns).

2. **ESLint enable** — new code avoids `console.log`, unused vars.

3. **`lib/db.ts`, `scripts/seed.ts`, `middleware.ts` deletion** — import pipeline writes ONLY through `lib/firestore.ts`. No imports of dead SQLite. `middleware.ts` removal is safe for this track.

### Likely file collisions (sorted by probability)

| File | UX | Security | Code-health |
|---|---|---|---|
| `app/api/attendance/route.ts` | DELETE handler | POST validation + tardy | strict types |
| `lib/firestore.ts` | +batch, +rollover, +setCampConfig | +validateAttendanceItem | strict returns |
| `lib/types.ts` | extend `CampConfig` | — | strict interfaces |
| `app/layout.tsx` | +CampConfigProvider, +ToastProvider | — | strict types |

**Proposed merge order:** UX Phase 1 → Code-health Phase A → Security P0s → UX Phase 2+ in parallel with other tracks.

---

## Parallelization Opportunities

- **After Phase 1:** Phases 2, 3, 4, 6 can start in parallel. Phase 7 Tasks 20/21/22 too.
- **Phase 2 Task 7 (Modal/Toast)** must land before Tasks 10, 12, 17, 20.
- **Phase 5 (Rollover)** depends on Phase 4 Task 14 only.
- **Phase 6** is fully independent of Phases 3, 4, 5 after Phase 1.
- Inside Phase 2, Task 8 (queue) and Task 9 (batch API) are independent.

**Suggested schedule for 2 engineers:**
- Eng A: P1 → P2 (7, 8, 10) → P3 (11, 12, 13) → P7 (20)
- Eng B: (after P1) P4 (14, 15) → P5 (16, 17) → P6 (18, 19) → P7 (21, 22)

---

## Effort Summary

| Task | Phase | Effort |
|---|---|---|
| 1 date-utils | 1 | S |
| 2 server config | 1 | S |
| 3 GET /api/config/camp | 1 | S |
| 4 CampConfigProvider | 1 | S |
| 5 teacher dashboard dates | 1 | S |
| 6 attendance page + admin dashboard dates | 1 | M |
| 7 Modal + Toast | 2 | M |
| 8 offline queue | 2 | S |
| 9 batch attendance API | 2 | M |
| 10 attendance UI rewrite | 2 | L |
| 11 student search + schedule API | 3 | S |
| 12 StudentDetailModal | 3 | M |
| 13 dashboard wire-up | 3 | M |
| 14 PUT config + rotate API | 4 | S |
| 15 /admin/settings | 4 | M |
| 16 rollover API | 5 | L |
| 17 rollover wizard | 5 | M |
| 18 parsers + schemas | 6 | M |
| 19 import page rewrite | 6 | L |
| 20 students edit modal | 7 | M |
| 21 schedule grid | 7 | M |
| 22 e2e smoke | 7 | S |

**Totals:** 22 tasks — 8 S, 10 M, 4 L. ≈ 3.5–5 engineer-weeks solo; 2–3 weeks with two engineers in parallel.

---

## Touched Files Index

### Created
- `lib/date-utils.ts`
- `lib/camp-config.ts`
- `lib/camp-config-client.tsx`
- `lib/attendance-queue.ts`
- `lib/import-parsers.ts`
- `lib/import-schemas.ts`
- `components/Modal.tsx`
- `components/Toast.tsx`
- `app/api/config/camp/route.ts`
- `app/api/config/camp-code/rotate/route.ts`
- `app/api/attendance/batch/route.ts`
- `app/api/camps/rollover/route.ts`
- `app/api/students/search/route.ts`
- `app/admin/settings/page.tsx`
- `app/admin/settings/rollover/page.tsx`
- `app/admin/dashboard/StudentDetailModal.tsx`
- `tests/unit/lib/date-utils.test.ts`
- `tests/unit/lib/import-parsers.test.ts`
- `tests/unit/lib/attendance-queue.test.ts`
- `tests/unit/components/Modal.test.tsx`
- `tests/unit/components/StudentDetailModal.test.tsx`
- `tests/integration/api/camp-config.test.ts`
- `tests/integration/api/attendance-batch.test.ts`
- `tests/integration/api/rollover.test.ts`
- `tests/e2e/settings-and-rollover.test.ts`

### Modified
- `app/layout.tsx`
- `app/globals.css`
- `app/teacher/[id]/page.tsx`
- `app/teacher/[id]/session/[sessionId]/page.tsx`
- `app/admin/dashboard/page.tsx`
- `app/admin/data/students/page.tsx`
- `app/admin/import/page.tsx`
- `app/admin/schedule/page.tsx`
- `app/api/attendance/route.ts` *(collision with security — coordinate)*
- `app/api/students/[id]/route.ts`
- `lib/types.ts`
- `lib/firestore.ts` *(append-only collision with security/code-health)*
- `tests/setup/api-client.ts` *(add `anonFetch`)*
- `vitest.config.ts`
- `package.json` + `package-lock.json`
