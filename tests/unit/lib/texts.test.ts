import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory fake Firestore for the `texts` collection.
const { store, docSetMock } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  docSetMock: vi.fn(),
}));

function matchesOp(actual: unknown, op: string, value: unknown): boolean {
  switch (op) {
    case '==':
      return actual === value;
    case '<':
      return (actual as string) < (value as string);
    case '<=':
      return (actual as string) <= (value as string);
    case '>':
      return (actual as string) > (value as string);
    case '>=':
      return (actual as string) >= (value as string);
    default:
      return false;
  }
}

interface FakeQuery {
  where: (field: string, op: string, value: unknown) => FakeQuery;
  orderBy: () => FakeQuery;
  get: () => Promise<{ docs: { id: string; data: () => unknown; ref: { id: string } }[]; empty: boolean; size: number }>;
}

function makeQuery(filter?: (d: Record<string, unknown>) => boolean): FakeQuery {
  const api: FakeQuery = {
    where: (field: string, op: string, value: unknown) =>
      makeQuery((d) => (filter ? filter(d) : true) && matchesOp(d[field], op, value)),
    orderBy: () => api,
    get: async () => {
      const docs = [...store.entries()]
        .filter(([, d]) => (filter ? filter(d) : true))
        .map(([id, d]) => ({ id, data: () => d, ref: { id } }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
  return api;
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (id: string) => ({
        id,
        set: async (data: Record<string, unknown>) => {
          docSetMock(id, data);
          store.set(id, { ...data });
        },
        update: async (patch: Record<string, unknown>) => {
          store.set(id, { ...(store.get(id) ?? {}), ...patch });
        },
        delete: async () => {
          store.delete(id);
        },
        get: async () => {
          const d = store.get(id);
          return { exists: !!d, id, data: () => d };
        },
      }),
      where: (field: string, op: string, value: unknown) =>
        makeQuery().where(field, op, value),
      orderBy: () => makeQuery(),
      get: async () => makeQuery().get(),
    }),
  },
  adminAuth: {},
}));

import {
  upsertText,
  listTexts,
  retagText,
  dismissText,
  getText,
  setTextEscalated,
  purgeExpiredTexts,
  computePurgeAfter,
} from '@/lib/texts';

function sampleDoc(over: Partial<Parameters<typeof upsertText>[0]> = {}) {
  return {
    guid: 'GUID-1',
    rowid: 100,
    service: 'iMessage',
    sender_handle: '+15551234567',
    sender_contact_id: null,
    sender_name: null,
    body: 'hello',
    has_attachments: false,
    decode_failed: false,
    tag: 'camp' as const,
    tag_reason: 'keyword: sick',
    sent_at: '2026-06-22T10:00:00.000Z',
    purge_after: '2026-07-22T10:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('computePurgeAfter', () => {
  it('uses campEnd + 30 days when a camp end date is given', () => {
    const r = computePurgeAfter('2026-06-30', '2026-06-22T00:00:00.000Z');
    // 2026-06-30 + 30d = 2026-07-30
    expect(r.startsWith('2026-07-30')).toBe(true);
  });

  it('falls back to sentAt + 90 days when campEnd is missing', () => {
    const r = computePurgeAfter(null, '2026-06-22T00:00:00.000Z');
    // +90d = 2026-09-20
    expect(r.startsWith('2026-09-20')).toBe(true);
  });
});

describe('upsertText', () => {
  it('is idempotent by guid (same guid twice -> one doc)', async () => {
    await upsertText(sampleDoc());
    await upsertText(sampleDoc({ body: 'hello again' }));
    expect(docSetMock).toHaveBeenCalledTimes(2);
    // Both writes target the same doc id (the guid).
    expect(docSetMock.mock.calls[0][0]).toBe('GUID-1');
    expect(docSetMock.mock.calls[1][0]).toBe('GUID-1');
    expect(store.size).toBe(1);
  });

  it('stamps created_at and stores the guid as id (not in body)', async () => {
    await upsertText(sampleDoc());
    const d = store.get('GUID-1')!;
    expect(d.created_at).toBeTruthy();
    expect(d.tag).toBe('camp');
  });
});

describe('listTexts', () => {
  beforeEach(async () => {
    await upsertText(sampleDoc({ guid: 'A', tag: 'camp' }));
    await upsertText(sampleDoc({ guid: 'B', tag: 'personal' }));
    await upsertText(sampleDoc({ guid: 'C', tag: 'unknown' }));
  });

  it('returns all texts when no tag filter', async () => {
    const all = await listTexts();
    expect(all).toHaveLength(3);
  });

  it('filters by tag', async () => {
    const camp = await listTexts({ tag: 'camp' });
    expect(camp.map((t) => t.id)).toEqual(['A']);
  });
});

describe('retagText / dismissText / setTextEscalated', () => {
  beforeEach(async () => {
    await upsertText(sampleDoc({ guid: 'A', tag: 'camp' }));
  });

  it('retag updates tag and reason', async () => {
    await retagText('A', 'personal', 'manual override');
    const d = store.get('A')!;
    expect(d.tag).toBe('personal');
    expect(d.tag_reason).toBe('manual override');
  });

  it('dismiss deletes the doc', async () => {
    await dismissText('A');
    expect(store.has('A')).toBe(false);
  });

  it('setTextEscalated stamps the case id', async () => {
    await setTextEscalated('A', 'CASE-9');
    expect(store.get('A')!.escalated_case_id).toBe('CASE-9');
  });

  it('getText returns the doc when it exists, null otherwise', async () => {
    const found = await getText('A');
    expect(found?.id).toBe('A');
    const missing = await getText('ZZZ');
    expect(missing).toBeNull();
  });
});

describe('purgeExpiredTexts', () => {
  const NOW = '2026-08-01T00:00:00.000Z';

  it('deletes docs whose purge_after is in the past', async () => {
    await upsertText(sampleDoc({ guid: 'old', purge_after: '2026-07-01T00:00:00.000Z' }));
    await upsertText(sampleDoc({ guid: 'new', purge_after: '2026-09-01T00:00:00.000Z' }));
    const n = await purgeExpiredTexts(new Date(NOW));
    expect(n).toBe(1);
    expect(store.has('old')).toBe(false);
    expect(store.has('new')).toBe(true);
  });

  it('skips expired docs that are escalated to a case (evidence retention)', async () => {
    await upsertText(
      sampleDoc({ guid: 'esc', purge_after: '2026-07-01T00:00:00.000Z', escalated_case_id: 'CASE-1' })
    );
    const n = await purgeExpiredTexts(new Date(NOW));
    expect(n).toBe(0);
    expect(store.has('esc')).toBe(true);
  });
});
