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
    coll('students').set('s1', { ensemble: 'Band 1' });
    coll('students').set('s2', { ensemble: 'Orchestra 1' });
    coll('students').set('s3', { ensemble: 'Jazz 1' });
  });
  it('ensures a live link per offered ensemble and resolves 10 items, no Jazz', async () => {
    const { token, url } = await issueSelectorLink('Front desk');
    expect(url).toBe(`/e/pick/${token}`);
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
