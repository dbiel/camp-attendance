# Incident Command Center — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 of the incident command center: roles, cases/contacts data model, Active Cases dashboard, paste intake with Claude parsing + confirm screen, case detail with timeline, tap-to-text outbound messages, and history.

**Architecture:** New Firestore collections (`cases`, `case_events`, `contacts`) accessed only via Admin SDK in API routes wrapped with a new `super_admin` requirement in `withAuth`. Paste parsing is a server route calling the Claude API with the roster in a cached system block; the confirm screen never trusts the parse. UI is new `/admin/cases` pages following existing client patterns (`useAuth().getAuthHeaders()`, polling instead of listeners).

**Tech Stack:** Next.js 14 App Router, Firebase Admin SDK, Firestore, Tailwind, vitest, `@anthropic-ai/sdk` (new dependency).

**Spec:** `docs/superpowers/specs/2026-06-09-incident-command-center-design.md`

**Working agreements for this plan:**
- All work on branch `feat/incident-command-center`.
- Run unit tests with `npx vitest run <path>`. Full suite: `npm test`.
- Timestamps are ISO strings (`new Date().toISOString()`), matching `created_at` conventions in `lib/types.ts`.
- Phone numbers are stored E.164 (`+1XXXXXXXXXX`).

---

### Task 0: Branch + dependency

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Create the branch**

```bash
cd /Users/davidbiel/Documents/Claude/camp-app-handoff/camp-app
git checkout -b feat/incident-command-center
```

- [ ] **Step 2: Install the Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 3: Document the new env var**

Append to `SETUP.md` under the env-var section:

```markdown
- `ANTHROPIC_API_KEY` — server-side key for the case-report parser (`/api/cases/parse`). Never exposed to the client.
- `CASE_PARSE_MODEL` — optional override for the parse model (default `claude-opus-4-8`).
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json SETUP.md
git commit -m "chore: add @anthropic-ai/sdk + env docs for incident command center"
```

---

### Task 1: Admin roles (`super_admin` / `dorm_admin`)

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/firestore.ts` (admin allowlist section, ~line 1370)
- Modify: `lib/with-auth.ts`
- Test: `tests/unit/lib/admin-roles.test.ts`

Missing `role` on an existing admin doc is treated as `super_admin` (backward compatible). `addAdmin` gains an optional role param defaulting to `super_admin`, so existing call sites are unaffected.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/admin-roles.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docGetMock, docSetMock } = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: docGetMock, set: docSetMock }),
      limit: () => ({ get: async () => ({ empty: false }) }),
    }),
  },
  adminAuth: {},
}));

import { getAdminRole, addAdmin } from '@/lib/firestore';

describe('getAdminRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when the admin doc does not exist', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    expect(await getAdminRole('nobody@example.com')).toBeNull();
  });

  it('defaults to super_admin when role field is missing (legacy docs)', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ added_by: 'x' }) });
    expect(await getAdminRole('david@example.com')).toBe('super_admin');
  });

  it('returns dorm_admin when set', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'dorm_admin' }) });
    expect(await getAdminRole('john@example.com')).toBe('dorm_admin');
  });

  it('lowercases the email for lookup', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    await getAdminRole('MiXeD@Example.COM');
    // lookup happened (doc path is built inside the mock); just assert no throw + null
  });
});

describe('addAdmin role param', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes role super_admin by default', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    await addAdmin('new@example.com', 'david@example.com');
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'super_admin' })
    );
  });

  it('writes dorm_admin when specified', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    await addAdmin('john@example.com', 'david@example.com', 'dorm_admin');
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'dorm_admin' })
    );
  });
});
```

> Note: read the current `addAdmin` implementation first (`lib/firestore.ts:1428`) and align the mock shape with how it actually reads/writes (it may check for an existing doc and throw "Admin already exists" — keep that behavior).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/admin-roles.test.ts`
Expected: FAIL — `getAdminRole` is not exported.

- [ ] **Step 3: Implement**

In `lib/types.ts` add:

```typescript
export type AdminRole = 'super_admin' | 'dorm_admin';
```

In `lib/firestore.ts` (admin allowlist section):

```typescript
import type { AdminRole } from './types'; // merge into existing type imports

/** Role for an allow-listed admin. Missing role field = legacy doc = super_admin. */
export async function getAdminRole(email: string): Promise<AdminRole | null> {
  const doc = await adminDb.collection('admins').doc(email.toLowerCase()).get();
  if (!doc.exists) return null;
  const role = doc.data()?.role;
  return role === 'dorm_admin' ? 'dorm_admin' : 'super_admin';
}
```

Extend `addAdmin` with `role: AdminRole = 'super_admin'` as a third parameter and include `role` in the written doc. Extend `listAdmins` to include `role` in its returned objects (defaulting missing to `'super_admin'`).

In `lib/with-auth.ts`:

```typescript
import { getCallerRole, CallerRole, verifyAdmin } from './auth';
import { getAdminRole } from './firestore';

export type RequiredRole = 'admin' | 'teacher' | 'super_admin';
```

and inside the wrapper, before the existing role check:

```typescript
if (required === 'super_admin') {
  const caller = await verifyAdmin(request);
  const adminRole = caller?.email ? await getAdminRole(caller.email) : null;
  if (adminRole !== 'super_admin') {
    if (!caller && options.rateLimitKey) {
      const ip = getClientIp(request);
      if (!checkRateLimit(`${options.rateLimitKey}:${ip}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    }
    return NextResponse.json(
      { error: caller ? 'Super admin access required' : 'Unauthorized' },
      { status: caller ? 403 : 401 }
    );
  }
  return await handler(request, { params: context.params, role: 'admin' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/admin-roles.test.ts tests/unit/lib/with-auth.test.ts tests/unit/api/admins.test.ts`
Expected: PASS (existing with-auth/admins tests must not regress).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/firestore.ts lib/with-auth.ts tests/unit/lib/admin-roles.test.ts
git commit -m "feat(auth): admin role field with super_admin requirement in withAuth"
```

---

### Task 2: Contacts library

**Files:**
- Create: `lib/contacts.ts`
- Modify: `lib/types.ts`
- Test: `tests/unit/lib/contacts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/contacts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { addMock, getMock, whereGetMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  getMock: vi.fn(),
  whereGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      add: addMock,
      get: getMock,
      where: () => ({ limit: () => ({ get: whereGetMock }) }),
      orderBy: () => ({ get: getMock }),
    }),
  },
}));

import { normalizePhone, createContact, findContactByPhone } from '@/lib/contacts';

describe('normalizePhone', () => {
  it('normalizes 10-digit US numbers', () => {
    expect(normalizePhone('806-928-3654')).toBe('+18069283654');
    expect(normalizePhone('(806) 928 3654')).toBe('+18069283654');
  });
  it('normalizes 11-digit numbers starting with 1', () => {
    expect(normalizePhone('1 806 928 3654')).toBe('+18069283654');
  });
  it('passes through E.164 untouched', () => {
    expect(normalizePhone('+18069283654')).toBe('+18069283654');
  });
  it('returns null for garbage', () => {
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('createContact', () => {
  beforeEach(() => vi.clearAllMocks());
  it('stores normalized phone and lowercased role', async () => {
    addMock.mockResolvedValue({ id: 'c1' });
    const id = await createContact({ name: 'Sarah Lee', role: 'dorm_staff', phone: '806.555.0101' });
    expect(id).toBe('c1');
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+18065550101', name: 'Sarah Lee', role: 'dorm_staff' })
    );
  });
  it('rejects an unnormalizable phone', async () => {
    await expect(createContact({ name: 'X', role: 'faculty', phone: 'nope' })).rejects.toThrow(/phone/i);
  });
});

describe('findContactByPhone', () => {
  beforeEach(() => vi.clearAllMocks());
  it('matches on the normalized form', async () => {
    whereGetMock.mockResolvedValue({
      empty: false,
      docs: [{ id: 'c1', data: () => ({ name: 'Sarah Lee', phone: '+18065550101', role: 'dorm_staff' }) }],
    });
    const c = await findContactByPhone('(806) 555-0101');
    expect(c?.id).toBe('c1');
  });
  it('returns null when nothing matches', async () => {
    whereGetMock.mockResolvedValue({ empty: true, docs: [] });
    expect(await findContactByPhone('806-555-9999')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/contacts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/contacts.ts`**

```typescript
import { adminDb } from './firebase-admin';

export type ContactRole = 'faculty' | 'dorm_staff' | 'admin' | 'other';

export interface Contact {
  id: string;
  name: string;
  role: ContactRole;
  phone: string; // E.164
  dorm_building?: string;
  notes?: string;
  created_at: string;
}

const COLLECTION = 'contacts';

/** Normalize a US phone number to E.164. Returns null if it can't be. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+1\d{10}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function createContact(input: {
  name: string;
  role: ContactRole;
  phone: string;
  dorm_building?: string;
  notes?: string;
}): Promise<string> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error('Invalid phone number');
  const doc: Omit<Contact, 'id'> = {
    name: input.name.trim(),
    role: input.role,
    phone,
    ...(input.dorm_building ? { dorm_building: input.dorm_building } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    created_at: new Date().toISOString(),
  };
  const ref = await adminDb.collection(COLLECTION).add(doc);
  return ref.id;
}

export async function listContacts(): Promise<Contact[]> {
  const snap = await adminDb.collection(COLLECTION).orderBy('name').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) }));
}

export async function findContactByPhone(raw: string): Promise<Contact | null> {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const snap = await adminDb.collection(COLLECTION).where('phone', '==', phone).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<Contact, 'id'>) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/contacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/contacts.ts lib/types.ts tests/unit/lib/contacts.test.ts
git commit -m "feat: contacts library with E.164 phone normalization"
```

---

### Task 3: Cases data layer + Firestore rules

**Files:**
- Create: `lib/cases.ts`
- Modify: `firestore.rules`
- Test: `tests/unit/lib/cases.test.ts`

Cases carry a share token from day one (Phase 2 uses it); tokens are 128-bit hex from `crypto.randomBytes`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/cases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  added: [] as any[],
  addMock: vi.fn(),
  docGetMock: vi.fn(),
  docUpdateMock: vi.fn(),
  queryGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => {
  const queryable = {
    where: vi.fn(() => queryable),
    orderBy: vi.fn(() => queryable),
    limit: vi.fn(() => queryable),
    get: state.queryGetMock,
  };
  return {
    adminDb: {
      collection: () => ({
        add: state.addMock,
        doc: () => ({ get: state.docGetMock, update: state.docUpdateMock }),
        ...queryable,
      }),
    },
  };
});

import { createCase, resolveCase, addCaseEvent } from '@/lib/cases';

beforeEach(() => vi.clearAllMocks());

describe('createCase', () => {
  it('creates an active case with a 32-char hex share token and a report event', async () => {
    state.addMock.mockResolvedValueOnce({ id: 'case1' }).mockResolvedValueOnce({ id: 'ev1' });
    const id = await createCase({
      student_id: 's1',
      student_name: 'Johnny Smith',
      reporter_contact_id: 'c1',
      reporter_name: 'Mr. Jones',
      summary: 'Missing from trumpet sectional',
      raw_text: 'johnny smith not in sectional',
      created_by: 'david@bieldentalcabinets.com',
    });
    expect(id).toBe('case1');
    const caseDoc = state.addMock.mock.calls[0][0];
    expect(caseDoc.status).toBe('active');
    expect(caseDoc.share_token).toMatch(/^[0-9a-f]{32}$/);
    const eventDoc = state.addMock.mock.calls[1][0];
    expect(eventDoc).toMatchObject({ case_id: 'case1', type: 'report_received' });
  });
});

describe('resolveCase', () => {
  it('sets status resolved + resolution note and appends a timeline event', async () => {
    state.addMock.mockResolvedValue({ id: 'ev2' });
    await resolveCase('case1', 'Found at dining hall', 'david@bieldentalcabinets.com');
    expect(state.docUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved', resolution_note: 'Found at dining hall' })
    );
    expect(state.addMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'resolved', body: 'Found at dining hall' })
    );
  });
});

describe('addCaseEvent', () => {
  it('writes a timeline event with actor and timestamp', async () => {
    state.addMock.mockResolvedValue({ id: 'ev3' });
    await addCaseEvent('case1', 'parent_texted', 'Texted parent at +1806…', 'david@bieldentalcabinets.com');
    const ev = state.addMock.mock.calls[0][0];
    expect(ev).toMatchObject({ case_id: 'case1', type: 'parent_texted', actor: 'david@bieldentalcabinets.com' });
    expect(typeof ev.created_at).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/cases.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/cases.ts`**

```typescript
import { randomBytes } from 'node:crypto';
import { adminDb } from './firebase-admin';

export type CaseStatus = 'active' | 'resolved';

export type CaseEventType =
  | 'report_received'
  | 'parent_texted'
  | 'dorm_staff_texted'
  | 'note'
  | 'resolved'
  | 'reopened';

export interface Case {
  id: string;
  status: CaseStatus;
  student_id: string;
  student_name: string; // denormalized for list rendering
  reporter_contact_id: string | null;
  reporter_name: string | null;
  summary: string;
  raw_text: string; // original pasted report, always preserved
  session_label: string | null; // free text: where/when they were missed
  share_token: string;
  resolution_note: string | null;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  type: CaseEventType;
  body: string;
  actor: string; // admin email (Phase 2: share-link staff name)
  created_at: string;
}

const CASES = 'cases';
const EVENTS = 'case_events';

export interface CreateCaseInput {
  student_id: string;
  student_name: string;
  reporter_contact_id?: string | null;
  reporter_name?: string | null;
  summary: string;
  raw_text: string;
  session_label?: string | null;
  created_by: string;
}

export async function createCase(input: CreateCaseInput): Promise<string> {
  const now = new Date().toISOString();
  const doc: Omit<Case, 'id'> = {
    status: 'active',
    student_id: input.student_id,
    student_name: input.student_name,
    reporter_contact_id: input.reporter_contact_id ?? null,
    reporter_name: input.reporter_name ?? null,
    summary: input.summary,
    raw_text: input.raw_text,
    session_label: input.session_label ?? null,
    share_token: randomBytes(16).toString('hex'),
    resolution_note: null,
    created_by: input.created_by,
    created_at: now,
    resolved_at: null,
  };
  const ref = await adminDb.collection(CASES).add(doc);
  await addCaseEvent(ref.id, 'report_received', input.summary, input.created_by);
  return ref.id;
}

export async function getCase(id: string): Promise<Case | null> {
  const doc = await adminDb.collection(CASES).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as Omit<Case, 'id'>) }) : null;
}

export async function listCases(status: CaseStatus): Promise<Case[]> {
  const snap = await adminDb
    .collection(CASES)
    .where('status', '==', status)
    .orderBy('created_at', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Case, 'id'>) }));
}

export async function listCasesForStudent(studentId: string): Promise<Case[]> {
  const snap = await adminDb
    .collection(CASES)
    .where('student_id', '==', studentId)
    .orderBy('created_at', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Case, 'id'>) }));
}

export async function resolveCase(id: string, note: string, actor: string): Promise<void> {
  await adminDb.collection(CASES).doc(id).update({
    status: 'resolved',
    resolution_note: note,
    resolved_at: new Date().toISOString(),
  });
  await addCaseEvent(id, 'resolved', note, actor);
}

export async function addCaseEvent(
  caseId: string,
  type: CaseEventType,
  body: string,
  actor: string
): Promise<string> {
  const ref = await adminDb.collection(EVENTS).add({
    case_id: caseId,
    type,
    body,
    actor,
    created_at: new Date().toISOString(),
  });
  return ref.id;
}

export async function listCaseEvents(caseId: string): Promise<CaseEvent[]> {
  const snap = await adminDb
    .collection(EVENTS)
    .where('case_id', '==', caseId)
    .orderBy('created_at', 'asc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CaseEvent, 'id'>) }));
}
```

- [ ] **Step 4: Add explicit deny rules**

In `firestore.rules`, above the catch-all block, add (matching the file's explicit-block convention):

```
    // Incident command center collections: server-side only via Admin SDK.
    // Share-link access (Phase 2) goes through token-validating API routes.
    match /cases/{caseId} {
      allow read, write: if false;
    }
    match /case_events/{eventId} {
      allow read, write: if false;
    }
    match /contacts/{contactId} {
      allow read, write: if false;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/cases.test.ts`
Expected: PASS.

Note: `listCases`/`listCasesForStudent`/`listCaseEvents` use `where` + `orderBy`, which needs composite indexes. Add to `firestore.indexes.json`:

```json
{ "collectionGroup": "cases", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "created_at", "order": "DESCENDING" } ] },
{ "collectionGroup": "cases", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "student_id", "order": "ASCENDING" },
  { "fieldPath": "created_at", "order": "DESCENDING" } ] },
{ "collectionGroup": "case_events", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "case_id", "order": "ASCENDING" },
  { "fieldPath": "created_at", "order": "ASCENDING" } ] }
```

(merge into the existing `indexes` array).

- [ ] **Step 6: Commit**

```bash
git add lib/cases.ts firestore.rules firestore.indexes.json tests/unit/lib/cases.test.ts
git commit -m "feat: cases data layer (cases + case_events) with deny-all rules and indexes"
```

---

### Task 4: Claude parse library

**Files:**
- Create: `lib/case-parse.ts`
- Test: `tests/unit/lib/case-parse.test.ts`

Server-only. Builds a system prompt containing the roster (cached via `cache_control` — the roster is stable across requests) and known contacts, then asks for structured JSON via `output_config.format`. Any failure returns `null`; the route falls back to manual entry.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/case-parse.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: createMock };
  },
}));

import { parseReport } from '@/lib/case-parse';

const students = [
  { id: 's1', first_name: 'Jonathan', last_name: 'Smith', preferred_name: 'Johnny', ensemble: 'Band 1', dorm_building: 'Murdough', instrument: 'Trumpet' },
  { id: 's2', first_name: 'Jane', last_name: 'Smith', preferred_name: null, ensemble: 'Orchestra 1', dorm_building: 'Hulen', instrument: 'Violin' },
] as any[];

const contacts = [
  { id: 'c1', name: 'Mr. Jones', phone: '+18065550101', role: 'faculty' },
] as any[];

beforeEach(() => vi.clearAllMocks());

describe('parseReport', () => {
  it('returns the parsed structure from the model JSON', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        student_ids: ['s1'],
        student_query: 'johnny smith',
        reporter_contact_id: 'c1',
        reporter_name: null,
        reporter_phone: null,
        summary: 'Missing from trumpet sectional',
        session_label: 'Trumpet sectional, period 3',
      }) }],
    });
    const result = await parseReport('johnny smtih not in trumpet sectional - jones', students, contacts);
    expect(result?.student_ids).toEqual(['s1']);
    expect(result?.reporter_contact_id).toBe('c1');
  });

  it('includes the roster in the system prompt with cache_control', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: '{}' }] });
    await parseReport('whatever', students, contacts);
    const req = createMock.mock.calls[0][0];
    const systemBlocks = req.system as Array<{ text: string; cache_control?: object }>;
    expect(systemBlocks.some((b) => b.text.includes('Jonathan'))).toBe(true);
    expect(systemBlocks[systemBlocks.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.output_config?.format?.type).toBe('json_schema');
  });

  it('returns null when the API call throws', async () => {
    createMock.mockRejectedValue(new Error('boom'));
    expect(await parseReport('text', students, contacts)).toBeNull();
  });

  it('returns null when the model returns non-JSON', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'sorry, I cannot' }] });
    expect(await parseReport('text', students, contacts)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/case-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/case-parse.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { Student } from './types';
import type { Contact } from './contacts';

export interface ParsedReport {
  /** Roster ids of candidate students, best match first (max 3). Empty = no match. */
  student_ids: string[];
  /** The raw name string the reporter used, for display when no match. */
  student_query: string | null;
  reporter_contact_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  summary: string;
  session_label: string | null;
}

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    student_ids: { type: 'array', items: { type: 'string' } },
    student_query: { type: ['string', 'null'] },
    reporter_contact_id: { type: ['string', 'null'] },
    reporter_name: { type: ['string', 'null'] },
    reporter_phone: { type: ['string', 'null'] },
    summary: { type: 'string' },
    session_label: { type: ['string', 'null'] },
  },
  required: [
    'student_ids', 'student_query', 'reporter_contact_id',
    'reporter_name', 'reporter_phone', 'summary', 'session_label',
  ],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `You parse incident reports texted to a band-camp director about campers missing from class.
Given a pasted text message, identify:
- student_ids: ids from the roster below matching the kid mentioned. Names may be misspelled or use nicknames — fuzzy match. Best match first, up to 3 candidates. Empty array if nothing plausibly matches.
- student_query: the name string as written in the message (null if no kid is named).
- reporter_contact_id: the id from the contact list if the sender is identifiable by name or phone number; otherwise null.
- reporter_name / reporter_phone: name or phone of the sender if present in the text but NOT in the contact list; otherwise null.
- summary: one short sentence describing what happened.
- session_label: where/when the kid was missed, as stated (e.g. "Trumpet sectional, period 3"); null if not stated.
Return only data supported by the message — never invent.`;

function rosterBlock(students: Student[]): string {
  const lines = students.map((s) =>
    `${s.id}\t${s.first_name} ${s.last_name}${s.preferred_name ? ` (goes by ${s.preferred_name})` : ''}\t${s.instrument}\t${s.ensemble ?? '?'}\t${s.dorm_building ?? 'commuter'}`
  );
  return `ROSTER (id, name, instrument, ensemble, dorm):\n${lines.join('\n')}`;
}

function contactsBlock(contacts: Contact[]): string {
  const lines = contacts.map((c) => `${c.id}\t${c.name}\t${c.phone}\t${c.role}`);
  return `KNOWN CONTACTS (id, name, phone, role):\n${lines.join('\n')}`;
}

export async function parseReport(
  rawText: string,
  students: Student[],
  contacts: Contact[]
): Promise<ParsedReport | null> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.CASE_PARSE_MODEL || 'claude-opus-4-8',
      max_tokens: 2048,
      system: [
        { type: 'text', text: INSTRUCTIONS },
        {
          type: 'text',
          text: `${rosterBlock(students)}\n\n${contactsBlock(contacts)}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
      messages: [{ role: 'user', content: rawText }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;
    const parsed = JSON.parse(textBlock.text) as ParsedReport;
    if (!Array.isArray(parsed.student_ids) || typeof parsed.summary !== 'string') return null;
    return parsed;
  } catch (error) {
    console.error('[case-parse] failed:', error);
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/case-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/case-parse.ts tests/unit/lib/case-parse.test.ts
git commit -m "feat: Claude-backed report parser with roster prompt caching"
```

---

### Task 5: Message templates library + config storage

**Files:**
- Create: `lib/messages.ts`
- Test: `tests/unit/lib/messages.test.ts`

Templates live in `config/message_templates`. `renderTemplate` substitutes `{placeholders}`; unknown placeholders render as empty string. `smsHref` builds the cross-platform `sms:` URI.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/messages.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docGetMock, docSetMock } = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: docGetMock, set: docSetMock }) }) },
}));

import { renderTemplate, smsHref, getMessageTemplates, DEFAULT_TEMPLATES } from '@/lib/messages';

describe('renderTemplate', () => {
  it('substitutes placeholders', () => {
    expect(renderTemplate('Hi {parent_first}, {kid_first} is fine.', { parent_first: 'Beth', kid_first: 'Johnny' }))
      .toBe('Hi Beth, Johnny is fine.');
  });
  it('renders unknown placeholders as empty', () => {
    expect(renderTemplate('Hi {nope}!', {})).toBe('Hi !');
  });
});

describe('smsHref', () => {
  it('builds an sms URI with encoded body', () => {
    expect(smsHref('+18065550101', 'Hi Beth & co')).toBe('sms:+18065550101?&body=Hi%20Beth%20%26%20co');
  });
});

describe('getMessageTemplates', () => {
  beforeEach(() => vi.clearAllMocks());
  it('falls back to defaults when doc is missing', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    expect(await getMessageTemplates()).toEqual(DEFAULT_TEMPLATES);
  });
  it('merges stored values over defaults', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ parent: 'custom' }) });
    const t = await getMessageTemplates();
    expect(t.parent).toBe('custom');
    expect(t.dorm_staff).toBe(DEFAULT_TEMPLATES.dorm_staff);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/messages.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/messages.ts`**

```typescript
import { adminDb } from './firebase-admin';

export interface MessageTemplates {
  parent: string;
  dorm_staff: string;
}

export const DEFAULT_TEMPLATES: MessageTemplates = {
  parent:
    'Hi {parent_first}, this is David Biel with the TTU Band & Orchestra Camp. ' +
    '{kid_first} was marked missing from {session} and we are working to locate them. ' +
    'Please reply or call if you know where {kid_first} is.',
  dorm_staff:
    'TTUBOC: {kid_name} ({dorm_building} {dorm_room}) was reported missing from {session}. ' +
    'Can you check the room and text me back?',
};

const DOC = 'message_templates';

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

/** Cross-platform sms: URI (the `?&body=` form works on both iOS and Android). */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

export async function getMessageTemplates(): Promise<MessageTemplates> {
  const doc = await adminDb.collection('config').doc(DOC).get();
  if (!doc.exists) return { ...DEFAULT_TEMPLATES };
  return { ...DEFAULT_TEMPLATES, ...(doc.data() as Partial<MessageTemplates>) };
}

export async function setMessageTemplates(partial: Partial<MessageTemplates>): Promise<MessageTemplates> {
  await adminDb.collection('config').doc(DOC).set(partial, { merge: true });
  return getMessageTemplates();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/messages.ts tests/unit/lib/messages.test.ts
git commit -m "feat: message templates with render + sms: href helpers"
```

---

### Task 6: API routes — cases, contacts, parse, templates

**Files:**
- Create: `app/api/cases/route.ts`
- Create: `app/api/cases/[id]/route.ts`
- Create: `app/api/cases/[id]/events/route.ts`
- Create: `app/api/cases/parse/route.ts`
- Create: `app/api/contacts/route.ts`
- Create: `app/api/config/templates/route.ts`
- Test: `tests/unit/api/cases.test.ts`

All routes require `super_admin` via `withAuth('super_admin', ...)` from Task 1.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/api/cases.test.ts` (follow the mock style of `tests/unit/api/admins.test.ts` — mock `@/lib/cases`, `@/lib/auth`, `@/lib/firestore` so `withAuth` resolves a super_admin):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  listCases: vi.fn(),
  createCase: vi.fn(),
  getCase: vi.fn(),
  resolveCase: vi.fn(),
  addCaseEvent: vi.fn(),
  listCaseEvents: vi.fn(),
  listCasesForStudent: vi.fn(),
  getStudent: vi.fn(),
  getAdminRole: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/cases', () => ({
  listCases: m.listCases,
  createCase: m.createCase,
  getCase: m.getCase,
  resolveCase: m.resolveCase,
  addCaseEvent: m.addCaseEvent,
  listCaseEvents: m.listCaseEvents,
  listCasesForStudent: m.listCasesForStudent,
}));
vi.mock('@/lib/firestore', () => ({
  getAdminRole: m.getAdminRole,
  getStudent: m.getStudent,
}));
vi.mock('@/lib/auth', () => ({
  verifyAdmin: m.verifyAdmin,
  getCallerRole: vi.fn(),
}));

import { GET, POST } from '@/app/api/cases/route';

function req(method: string, body?: unknown, url = 'http://test/api/cases') {
  return new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.verifyAdmin.mockResolvedValue({ email: 'david@bieldentalcabinets.com' });
  m.getAdminRole.mockResolvedValue('super_admin');
});

describe('GET /api/cases', () => {
  it('returns active cases by default', async () => {
    m.listCases.mockResolvedValue([{ id: 'c1', status: 'active' }]);
    const res = await GET(req('GET'), { params: {} });
    expect(res.status).toBe(200);
    expect(m.listCases).toHaveBeenCalledWith('active');
  });
  it('returns resolved cases with ?status=resolved', async () => {
    m.listCases.mockResolvedValue([]);
    await GET(req('GET', undefined, 'http://test/api/cases?status=resolved'), { params: {} });
    expect(m.listCases).toHaveBeenCalledWith('resolved');
  });
  it('403s for dorm_admin', async () => {
    m.getAdminRole.mockResolvedValue('dorm_admin');
    const res = await GET(req('GET'), { params: {} });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/cases', () => {
  it('validates the student exists and creates the case', async () => {
    m.getStudent.mockResolvedValue({ id: 's1', first_name: 'Johnny', last_name: 'Smith' });
    m.createCase.mockResolvedValue('case1');
    const res = await POST(
      req('POST', { student_id: 's1', summary: 'missing', raw_text: 'raw' }),
      { params: {} }
    );
    expect(res.status).toBe(200);
    expect(m.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 's1', student_name: 'Johnny Smith', created_by: 'david@bieldentalcabinets.com' })
    );
  });
  it('400s on unknown student', async () => {
    m.getStudent.mockResolvedValue(undefined);
    const res = await POST(req('POST', { student_id: 'nope', summary: 'x', raw_text: 'y' }), { params: {} });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/api/cases.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the routes**

`app/api/cases/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { listCases, createCase } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const status = request.nextUrl.searchParams.get('status') === 'resolved' ? 'resolved' : 'active';
    const cases = await listCases(status);
    return NextResponse.json({ cases });
  },
  { rateLimitKey: 'cases' }
);

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { student_id, summary, raw_text, reporter_contact_id, reporter_name, session_label } =
      body as Record<string, unknown>;
    if (typeof student_id !== 'string' || typeof summary !== 'string' || typeof raw_text !== 'string') {
      return NextResponse.json({ error: 'student_id, summary, raw_text required' }, { status: 400 });
    }
    const student = await getStudent(student_id);
    if (!student) return NextResponse.json({ error: 'Unknown student' }, { status: 400 });

    const caller = await verifyAdmin(request);
    const id = await createCase({
      student_id,
      student_name: `${student.first_name} ${student.last_name}`,
      summary,
      raw_text,
      reporter_contact_id: typeof reporter_contact_id === 'string' ? reporter_contact_id : null,
      reporter_name: typeof reporter_name === 'string' ? reporter_name : null,
      session_label: typeof session_label === 'string' ? session_label : null,
      created_by: caller?.email || 'unknown',
    });
    return NextResponse.json({ id });
  },
  { rateLimitKey: 'cases' }
);
```

`app/api/cases/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getCase, listCaseEvents, listCasesForStudent, resolveCase } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(
  'super_admin',
  async (_request, { params }) => {
    const c = await getCase(params.id);
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [events, student, priorCases] = await Promise.all([
      listCaseEvents(c.id),
      getStudent(c.student_id),
      listCasesForStudent(c.student_id),
    ]);
    return NextResponse.json({
      case: c,
      events,
      student: student ?? null,
      prior_cases: priorCases.filter((p) => p.id !== c.id),
    });
  },
  { rateLimitKey: 'cases' }
);

export const PATCH = withAuth<{ id: string }>(
  'super_admin',
  async (request, { params }) => {
    const body = await request.json().catch(() => null);
    const note = (body as { resolution_note?: unknown })?.resolution_note;
    if (typeof note !== 'string' || !note.trim()) {
      return NextResponse.json({ error: 'resolution_note required' }, { status: 400 });
    }
    const c = await getCase(params.id);
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const caller = await verifyAdmin(request);
    await resolveCase(params.id, note.trim(), caller?.email || 'unknown');
    return NextResponse.json({ ok: true });
  },
  { rateLimitKey: 'cases' }
);
```

`app/api/cases/[id]/events/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { addCaseEvent, getCase, CaseEventType } from '@/lib/cases';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED: CaseEventType[] = ['parent_texted', 'dorm_staff_texted', 'note'];

export const POST = withAuth<{ id: string }>(
  'super_admin',
  async (request, { params }) => {
    const body = await request.json().catch(() => null);
    const { type, body: text } = (body ?? {}) as Record<string, unknown>;
    if (typeof type !== 'string' || !ALLOWED.includes(type as CaseEventType) || typeof text !== 'string') {
      return NextResponse.json({ error: `type must be one of ${ALLOWED.join(', ')}; body required` }, { status: 400 });
    }
    if (!(await getCase(params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const caller = await verifyAdmin(request);
    const id = await addCaseEvent(params.id, type as CaseEventType, text, caller?.email || 'unknown');
    return NextResponse.json({ id });
  },
  { rateLimitKey: 'cases' }
);
```

`app/api/cases/parse/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { parseReport } from '@/lib/case-parse';
import { getStudents } from '@/lib/firestore';
import { listContacts } from '@/lib/contacts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const text = (body as { text?: unknown })?.text;
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    const [students, contacts] = await Promise.all([getStudents(), listContacts()]);
    const parsed = await parseReport(text, students, contacts);
    if (!parsed) {
      // Parse is an accelerator, never a gate — the client falls back to manual entry.
      return NextResponse.json({ ok: false, raw_text: text });
    }
    const candidates = parsed.student_ids
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({
        id: s!.id,
        name: `${s!.first_name} ${s!.last_name}`,
        ensemble: s!.ensemble,
        dorm_building: s!.dorm_building,
        instrument: s!.instrument,
      }));
    return NextResponse.json({ ok: true, parsed, candidates, raw_text: text });
  },
  { rateLimitKey: 'cases-parse' }
);
```

`app/api/contacts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { listContacts, createContact, ContactRole } from '@/lib/contacts';

export const dynamic = 'force-dynamic';

const ROLES: ContactRole[] = ['faculty', 'dorm_staff', 'admin', 'other'];

export const GET = withAuth(
  'super_admin',
  async () => NextResponse.json({ contacts: await listContacts() }),
  { rateLimitKey: 'contacts' }
);

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const { name, role, phone, dorm_building, notes } = (body ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' ||
        typeof role !== 'string' || !ROLES.includes(role as ContactRole)) {
      return NextResponse.json({ error: 'name, phone, and valid role required' }, { status: 400 });
    }
    try {
      const id = await createContact({
        name, phone,
        role: role as ContactRole,
        dorm_building: typeof dorm_building === 'string' ? dorm_building : undefined,
        notes: typeof notes === 'string' ? notes : undefined,
      });
      return NextResponse.json({ id });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  },
  { rateLimitKey: 'contacts' }
);
```

`app/api/config/templates/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getMessageTemplates, setMessageTemplates } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  'super_admin',
  async () => NextResponse.json({ templates: await getMessageTemplates() }),
  { rateLimitKey: 'templates' }
);

export const PUT = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const { parent, dorm_staff } = (body ?? {}) as Record<string, unknown>;
    const partial: Record<string, string> = {};
    if (typeof parent === 'string') partial.parent = parent;
    if (typeof dorm_staff === 'string') partial.dorm_staff = dorm_staff;
    if (Object.keys(partial).length === 0) {
      return NextResponse.json({ error: 'parent or dorm_staff required' }, { status: 400 });
    }
    return NextResponse.json({ templates: await setMessageTemplates(partial) });
  },
  { rateLimitKey: 'templates' }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/api/cases.test.ts && npm test`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/api/cases app/api/contacts app/api/config/templates tests/unit/api/cases.test.ts
git commit -m "feat(api): cases, contacts, parse, and templates routes (super_admin gated)"
```

---

### Task 7: UI — Active Cases dashboard with paste intake + confirm

**Files:**
- Create: `app/admin/cases/page.tsx`
- Create: `app/admin/cases/NewReport.tsx`
- Create: `app/admin/cases/CaseCard.tsx`

Mobile-first. The paste box sits at the top; submitting calls `/api/cases/parse`, then renders the confirm form inline (pre-filled, every field editable, candidate picker when ambiguous, "who is this?" for unknown senders). Creating navigates to the case page. Case list polls every 30s.

No unit tests for these pages (the repo's component test coverage is thin and the logic lives in already-tested libs/routes); verification is manual in Task 10.

- [ ] **Step 1: Create `app/admin/cases/CaseCard.tsx`**

```tsx
'use client';

import Link from 'next/link';
import type { Case } from '@/lib/cases';

function elapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function CaseCard({ c }: { c: Case }) {
  return (
    <Link
      href={`/admin/cases/${c.id}`}
      className="block rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm hover:bg-amber-100"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold">{c.student_name}</span>
        <span className="text-sm text-gray-600">{elapsed(c.created_at)} ago</span>
      </div>
      <p className="mt-1 text-sm text-gray-800">{c.summary}</p>
      {c.session_label && <p className="text-xs text-gray-500">{c.session_label}</p>}
      {c.reporter_name && <p className="mt-1 text-xs text-gray-500">Reported by {c.reporter_name}</p>}
    </Link>
  );
}
```

- [ ] **Step 2: Create `app/admin/cases/NewReport.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { ParsedReport } from '@/lib/case-parse';

interface Candidate {
  id: string;
  name: string;
  ensemble: string | null;
  dorm_building?: string;
  instrument: string;
}

type Stage = 'paste' | 'confirm';

export function NewReport({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const { getAuthHeaders } = useAuth();
  const [stage, setStage] = useState<Stage>('paste');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [rawText, setRawText] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [studentId, setStudentId] = useState('');
  const [summary, setSummary] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [reporterContactId, setReporterContactId] = useState<string | null>(null);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterRole, setReporterRole] = useState('faculty');
  const [needsContactSave, setNeedsContactSave] = useState(false);

  async function parse() {
    setBusy(true);
    setError('');
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/cases/parse', { method: 'POST', headers, body: JSON.stringify({ text: rawText }) });
      const body = await res.json();
      if (body.ok) {
        const p = body.parsed as ParsedReport;
        setCandidates(body.candidates as Candidate[]);
        setStudentId((body.candidates as Candidate[])[0]?.id ?? '');
        setSummary(p.summary);
        setSessionLabel(p.session_label ?? '');
        setReporterContactId(p.reporter_contact_id);
        if (!p.reporter_contact_id && (p.reporter_name || p.reporter_phone)) {
          setReporterName(p.reporter_name ?? '');
          setReporterPhone(p.reporter_phone ?? '');
          setNeedsContactSave(Boolean(p.reporter_phone));
        }
      } else {
        setCandidates([]);
        setSummary('');
      }
      setStage('confirm');
    } catch {
      setError('Parse failed — fill in the case manually.');
      setStage('confirm');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!studentId) { setError('Pick a student.'); return; }
    setBusy(true);
    setError('');
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      let contactId = reporterContactId;
      if (needsContactSave && reporterName && reporterPhone) {
        const cres = await fetch('/api/contacts', {
          method: 'POST', headers,
          body: JSON.stringify({ name: reporterName, phone: reporterPhone, role: reporterRole }),
        });
        if (cres.ok) contactId = (await cres.json()).id;
      }
      const res = await fetch('/api/cases', {
        method: 'POST', headers,
        body: JSON.stringify({
          student_id: studentId,
          summary: summary || 'Reported missing',
          raw_text: rawText,
          reporter_contact_id: contactId,
          reporter_name: reporterName || null,
          session_label: sessionLabel || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Create failed');
      const { id } = await res.json();
      onCreated();
      router.push(`/admin/cases/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'paste') {
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">New report</h2>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the text message here…"
          className="h-28 w-full rounded border p-2 text-sm"
        />
        <button
          onClick={parse}
          disabled={busy || !rawText.trim()}
          className="mt-2 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Parsing…' : 'Parse report'}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">Confirm case</h2>
      <StudentPicker candidates={candidates} value={studentId} onChange={setStudentId} getAuthHeaders={getAuthHeaders} />
      <label className="mt-3 block text-sm font-medium">Summary</label>
      <input value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full rounded border p-2 text-sm" />
      <label className="mt-3 block text-sm font-medium">Where / when missed</label>
      <input value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)} className="w-full rounded border p-2 text-sm" />
      {!reporterContactId && (
        <fieldset className="mt-3 rounded border p-2">
          <legend className="px-1 text-sm font-medium">Who reported this?</legend>
          <input placeholder="Name" value={reporterName} onChange={(e) => setReporterName(e.target.value)} className="mb-2 w-full rounded border p-2 text-sm" />
          <input placeholder="Phone (optional)" value={reporterPhone} onChange={(e) => { setReporterPhone(e.target.value); setNeedsContactSave(Boolean(e.target.value)); }} className="mb-2 w-full rounded border p-2 text-sm" />
          <select value={reporterRole} onChange={(e) => setReporterRole(e.target.value)} className="w-full rounded border p-2 text-sm">
            <option value="faculty">Faculty</option>
            <option value="dorm_staff">Dorm staff</option>
            <option value="other">Other</option>
          </select>
        </fieldset>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={create} disabled={busy} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create case'}
        </button>
        <button onClick={() => setStage('paste')} className="rounded border px-4 py-2">Back</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Candidate buttons when the parser found matches; falls back to a name search against /api/students. */
function StudentPicker({ candidates, value, onChange, getAuthHeaders }: {
  candidates: Candidate[];
  value: string;
  onChange: (id: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=8`, { headers });
    if (res.ok) {
      const body = await res.json();
      const list = (body.students ?? body.results ?? []) as any[];
      setResults(list.map((s) => ({
        id: s.id, name: `${s.first_name} ${s.last_name}`,
        ensemble: s.ensemble, dorm_building: s.dorm_building, instrument: s.instrument,
      })));
    }
  }

  const options = candidates.length > 0 ? candidates : results;
  return (
    <div>
      <label className="block text-sm font-medium">Student</label>
      {candidates.length === 0 && (
        <input value={query} onChange={(e) => search(e.target.value)} placeholder="Search roster…" className="mb-2 w-full rounded border p-2 text-sm" />
      )}
      <div className="flex flex-col gap-1">
        {options.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`rounded border p-2 text-left text-sm ${value === c.id ? 'border-red-700 bg-red-50' : ''}`}
          >
            <span className="font-medium">{c.name}</span>
            <span className="ml-2 text-gray-500">{c.instrument} · {c.ensemble ?? '?'} · {c.dorm_building || 'commuter'}</span>
          </button>
        ))}
        {options.length === 0 && <p className="text-sm text-gray-500">No match — search the roster above.</p>}
      </div>
    </div>
  );
}
```

> Before wiring `StudentPicker`, read `app/api/students/route.ts` to confirm the search query param and response shape (`searchStudents` exists in `lib/firestore.ts:682`); adjust the fetch accordingly.

- [ ] **Step 3: Create `app/admin/cases/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';
import { CaseCard } from './CaseCard';
import { NewReport } from './NewReport';

export default function ActiveCases() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/cases?status=active', { headers });
    if (res.ok) setCases((await res.json()).cases as Case[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  if (authLoading || !user) return null;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Active Cases</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/cases/history" className="text-red-700 underline">History</Link>
          <Link href="/admin/coverage" className="text-gray-500 underline">Coverage</Link>
          <Link href="/admin/settings" className="text-gray-500 underline">Settings</Link>
          <button onClick={signOut} className="text-gray-500 underline">Sign out</button>
        </nav>
      </header>

      <NewReport onCreated={refresh} />

      <section className="mt-4 flex flex-col gap-2">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && cases.length === 0 && (
          <p className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            No active cases. 🎺
          </p>
        )}
        {cases.map((c) => <CaseCard key={c.id} c={c} />)}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
git add app/admin/cases
git commit -m "feat(ui): active cases dashboard with paste intake and confirm flow"
```

---

### Task 8: UI — Case detail with timeline + tap-to-text actions

**Files:**
- Create: `app/admin/cases/[id]/page.tsx`

Shows the kid card (dorm, parent, medical flag), prior-incident count, timeline, and three actions: **Text parent** (template → `sms:` href, logs `parent_texted`), **Text dorm staff** (contact picker filtered to `dorm_staff`, logs `dorm_staff_texted`), **Resolve** (note prompt → PATCH). Desktop fallback: a Copy button next to each sms link.

- [ ] **Step 1: Create `app/admin/cases/[id]/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case, CaseEvent } from '@/lib/cases';
import type { Student } from '@/lib/types';
import type { Contact } from '@/lib/contacts';
import { renderTemplate, smsHref, DEFAULT_TEMPLATES, type MessageTemplates } from '@/lib/messages-shared';

interface Detail {
  case: Case;
  events: CaseEvent[];
  student: Student | null;
  prior_cases: Case[];
}

export default function CaseDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [dormStaff, setDormStaff] = useState<Contact[]>([]);
  const [resolveNote, setResolveNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  const refresh = useCallback(async () => {
    const headers = await getAuthHeaders();
    const [dres, tres, cres] = await Promise.all([
      fetch(`/api/cases/${params.id}`, { headers }),
      fetch('/api/config/templates', { headers }),
      fetch('/api/contacts', { headers }),
    ]);
    if (dres.ok) setDetail(await dres.json());
    if (tres.ok) setTemplates((await tres.json()).templates);
    if (cres.ok) setDormStaff(((await cres.json()).contacts as Contact[]).filter((c) => c.role === 'dorm_staff'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function logEvent(type: 'parent_texted' | 'dorm_staff_texted' | 'note', body: string) {
    const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
    await fetch(`/api/cases/${params.id}/events`, { method: 'POST', headers, body: JSON.stringify({ type, body }) });
    refresh();
  }

  async function resolve() {
    const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
    await fetch(`/api/cases/${params.id}`, { method: 'PATCH', headers, body: JSON.stringify({ resolution_note: resolveNote }) });
    router.push('/admin/cases');
  }

  if (!detail || !user) return <main className="p-4 text-sm text-gray-500">Loading…</main>;
  const { case: c, student, events, prior_cases } = detail;

  const vars = {
    kid_first: student?.preferred_name || student?.first_name || '',
    kid_name: c.student_name,
    parent_first: student?.parent_first_name || '',
    session: c.session_label || 'class',
    dorm_building: student?.dorm_building || '',
    dorm_room: student?.dorm_room || '',
  };
  const parentBody = renderTemplate(templates.parent, vars);
  const dormBody = renderTemplate(templates.dorm_staff, vars);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link href="/admin/cases" className="text-sm text-red-700 underline">← Active cases</Link>
      <h1 className="mt-2 text-xl font-bold">{c.student_name}</h1>
      <p className="text-sm text-gray-600">{c.summary}{c.session_label ? ` — ${c.session_label}` : ''}</p>
      {c.status === 'resolved' && (
        <p className="mt-2 rounded bg-green-50 p-2 text-sm text-green-800">Resolved: {c.resolution_note}</p>
      )}

      {student && (
        <section className="mt-4 rounded border bg-white p-3 text-sm">
          <p><span className="font-medium">Dorm:</span> {student.dorm_building || 'Commuter'} {student.dorm_room || ''}</p>
          <p><span className="font-medium">Parent:</span> {student.parent_first_name} {student.parent_last_name} {student.parent_phone}</p>
          <p><span className="font-medium">Kid cell:</span> {student.cell_phone || '—'}</p>
          <p><span className="font-medium">Ensemble:</span> {student.ensemble} ({student.instrument})</p>
          {student.medical_notes && <p className="text-red-700"><span className="font-medium">Medical:</span> {student.medical_notes}</p>}
          {prior_cases.length > 0 && (
            <p className="mt-1 text-amber-700">⚠ {prior_cases.length} prior incident{prior_cases.length > 1 ? 's' : ''}</p>
          )}
        </section>
      )}

      {c.status === 'active' && (
        <section className="mt-4 flex flex-col gap-2">
          {student?.parent_phone && (
            <SmsAction
              label={`Text parent (${student.parent_first_name})`}
              href={smsHref(student.parent_phone, parentBody)}
              body={parentBody}
              onSent={() => logEvent('parent_texted', `Texted parent ${student.parent_phone}`)}
            />
          )}
          <DormStaffAction staff={dormStaff} body={dormBody} onSent={(name) => logEvent('dorm_staff_texted', `Texted dorm staff ${name}`)} />
          <button onClick={() => setShowResolve(true)} className="rounded bg-green-700 px-4 py-2 text-left text-white">
            ✓ Resolve case
          </button>
          {showResolve && (
            <div className="rounded border p-3">
              <input
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Where/how was the kid found?"
                className="w-full rounded border p-2 text-sm"
              />
              <button onClick={resolve} disabled={!resolveNote.trim()} className="mt-2 rounded bg-green-700 px-4 py-1 text-white disabled:opacity-50">
                Confirm resolve
              </button>
            </div>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="rounded border-l-4 border-gray-300 bg-white p-2">
              <span className="text-xs text-gray-500">{new Date(e.created_at).toLocaleTimeString()} · {e.actor}</span>
              <p>{e.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function SmsAction({ label, href, body, onSent }: { label: string; href: string; body: string; onSent: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <a href={href} onClick={onSent} className="flex-1 rounded bg-red-700 px-4 py-2 text-white">📱 {label}</a>
      <button
        onClick={() => { navigator.clipboard.writeText(body); onSent(); }}
        className="rounded border px-3 py-2 text-sm"
        title="Copy message"
      >
        Copy
      </button>
    </div>
  );
}

function DormStaffAction({ staff, body, onSent }: { staff: Contact[]; body: string; onSent: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  if (staff.length === 0) {
    return <p className="rounded border border-dashed p-2 text-sm text-gray-500">No dorm staff contacts yet — add them in Settings.</p>;
  }
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full rounded bg-red-700 px-4 py-2 text-left text-white">
        🏠 Text dorm staff…
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {staff.map((s) => (
            <a key={s.id} href={smsHref(s.phone, body)} onClick={() => onSent(s.name)} className="rounded border p-2 text-sm">
              {s.name} {s.dorm_building ? `(${s.dorm_building})` : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

> Note: `renderTemplate`/`smsHref` are pure functions; importing them client-side is fine, but `lib/messages.ts` also imports `firebase-admin`. **Split before wiring:** move `renderTemplate`, `smsHref`, `DEFAULT_TEMPLATES`, and the `MessageTemplates` type into a new `lib/messages-shared.ts` (no admin imports) and re-export them from `lib/messages.ts`. Client code imports from `@/lib/messages-shared`. Update the Task 5 test imports if needed.

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add app/admin/cases lib/messages.ts lib/messages-shared.ts
git commit -m "feat(ui): case detail with timeline and tap-to-text actions"
```

---

### Task 9: UI — History view + Settings templates section + landing redirect

**Files:**
- Create: `app/admin/cases/history/page.tsx`
- Create: `app/admin/settings/MessageTemplatesSection.tsx`
- Modify: `app/admin/settings/page.tsx` (render the new section)
- Modify: `app/admin/page.tsx` (both `router.push('/admin/coverage')` calls → `/admin/cases`)

- [ ] **Step 1: Create `app/admin/cases/history/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { Case } from '@/lib/cases';

export default function CaseHistory() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/cases?status=resolved', { headers });
      if (res.ok) setCases((await res.json()).cases as Case[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const visible = cases.filter((c) =>
    c.student_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link href="/admin/cases" className="text-sm text-red-700 underline">← Active cases</Link>
      <h1 className="mt-2 text-xl font-bold">Case History</h1>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by student name…"
        className="mt-2 w-full rounded border p-2 text-sm"
      />
      <ul className="mt-3 flex flex-col gap-2">
        {visible.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/cases/${c.id}`} className="block rounded border bg-white p-3 text-sm hover:bg-gray-50">
              <div className="flex justify-between">
                <span className="font-medium">{c.student_name}</span>
                <span className="text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-gray-700">{c.summary}</p>
              {c.resolution_note && <p className="text-green-700">→ {c.resolution_note}</p>}
            </Link>
          </li>
        ))}
        {visible.length === 0 && <p className="text-sm text-gray-500">No resolved cases.</p>}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Create `app/admin/settings/MessageTemplatesSection.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { DEFAULT_TEMPLATES, type MessageTemplates } from '@/lib/messages-shared';

export function MessageTemplatesSection() {
  const { getAuthHeaders } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/config/templates', { headers });
      if (res.ok) setTemplates((await res.json()).templates);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/config/templates', { method: 'PUT', headers, body: JSON.stringify(templates) });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="font-semibold">Message templates</h2>
      <p className="mb-2 text-xs text-gray-500">
        Placeholders: {'{kid_first} {kid_name} {parent_first} {session} {dorm_building} {dorm_room}'}
      </p>
      <label className="block text-sm font-medium">Parent</label>
      <textarea
        value={templates.parent}
        onChange={(e) => setTemplates({ ...templates, parent: e.target.value })}
        className="h-24 w-full rounded border p-2 text-sm"
      />
      <label className="mt-2 block text-sm font-medium">Dorm staff</label>
      <textarea
        value={templates.dorm_staff}
        onChange={(e) => setTemplates({ ...templates, dorm_staff: e.target.value })}
        className="h-24 w-full rounded border p-2 text-sm"
      />
      <button onClick={save} className="mt-2 rounded bg-red-700 px-4 py-2 text-white">Save templates</button>
      {saved && <span className="ml-2 text-sm text-green-700">Saved ✓</span>}
    </section>
  );
}
```

- [ ] **Step 3: Wire into settings + change landing**

In `app/admin/settings/page.tsx`, import and render `<MessageTemplatesSection />` alongside the existing sections (read the file first to match its layout structure).

In `app/admin/page.tsx`, replace both occurrences of `router.push('/admin/coverage')` with `router.push('/admin/cases')`.

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
git add app/admin/cases/history app/admin/settings app/admin/page.tsx
git commit -m "feat(ui): case history, template settings, land on /admin/cases"
```

---

### Task 10: Full-suite verification + manual smoke test

**Files:** none new.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: all green, including pre-existing tests.

- [ ] **Step 2: Build**

Run: `npx next build`
Expected: compiles with no type errors.

- [ ] **Step 3: Manual smoke test (dev server)**

```bash
npm run dev   # binds 0.0.0.0:3000 — open http://100.95.36.9:3000/admin from laptop/phone
```

Walk through (needs `ANTHROPIC_API_KEY` in `.env.local`):
1. Sign in with Google → lands on `/admin/cases`.
2. Paste `Johnny Smith isn't in trumpet sectional this period - Mr Jones 806-555-0101` → Parse → confirm screen shows a candidate, reporter capture for the unknown number.
3. Create case → case page shows kid card, parent text button opens `sms:` (verify on phone), Copy works on desktop, events appear in the timeline.
4. Resolve with a note → back on dashboard, case gone; appears in History; re-reporting the same kid shows "1 prior incident".
5. Settings → edit the parent template → save → new wording appears on a case page.

- [ ] **Step 4: Commit any fixes, then finish the branch**

Use superpowers:finishing-a-development-branch — merge/PR decision is David's call (pushes to `main` need approval).

---

## Out of scope for this plan (Phase 2/3)

Screenshot intake, share-link pages + On it / Found, PWA + FCM push, duty rosters + `dorm_admin` UI, contact-sheet import, on-duty resolution for dorm texting, Mac Mini Messages watcher. Each gets its own plan once Phase 1 is merged.
