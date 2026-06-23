import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  docUpdateMock: vi.fn(),
  queryGetMock: vi.fn(),
  whereMock: vi.fn(),
  limitMock: vi.fn(),
  lastDocId: '',
}));

vi.mock('@/lib/firebase-admin', () => {
  const queryable = {
    where: (...args: unknown[]) => {
      state.whereMock(...args);
      return queryable;
    },
    orderBy: vi.fn(() => queryable),
    limit: (...args: unknown[]) => {
      state.limitMock(...args);
      return queryable;
    },
    get: state.queryGetMock,
  };
  return {
    adminDb: {
      collection: () => ({
        doc: (id: string) => {
          state.lastDocId = id;
          return { update: state.docUpdateMock };
        },
        ...queryable,
      }),
    },
  };
});

import { issueShareLink, revokeShareLink, validateShareToken } from '@/lib/cases';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  state.lastDocId = '';
});

describe('issueShareLink', () => {
  it('rotates the token and sets a 4h expiry, fresh issued_at, not revoked, recipient label', async () => {
    const now = new Date('2026-06-22T12:00:00.000Z');
    const result = await issueShareLink('case1', 'Counselor Jane', now);

    // token is fresh random hex
    expect(result.token).toMatch(/^[0-9a-f]{32}$/);
    expect(result.url).toBe(`/r/${result.token}`);
    expect(result.expires_at).toBe(new Date(now.getTime() + FOUR_HOURS_MS).toISOString());

    expect(state.lastDocId).toBe('case1');
    const update = state.docUpdateMock.mock.calls[0][0];
    expect(update.share_token).toBe(result.token);
    expect(update.share_issued_at).toBe(now.toISOString());
    expect(update.share_expires_at).toBe(new Date(now.getTime() + FOUR_HOURS_MS).toISOString());
    expect(update.share_revoked).toBe(false);
    expect(update.share_recipient_label).toBe('Counselor Jane');
  });

  it('rotates to a different token on re-issue (old token dies)', async () => {
    const now = new Date('2026-06-22T12:00:00.000Z');
    const first = await issueShareLink('case1', null, now);
    const second = await issueShareLink('case1', null, now);
    expect(first.token).not.toBe(second.token);
  });
});

describe('revokeShareLink', () => {
  it('sets share_revoked = true', async () => {
    await revokeShareLink('case1');
    expect(state.lastDocId).toBe('case1');
    expect(state.docUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ share_revoked: true })
    );
  });
});

describe('validateShareToken', () => {
  const issued = '2026-06-22T12:00:00.000Z';
  const expires = new Date(new Date(issued).getTime() + FOUR_HOURS_MS).toISOString();

  function mockCaseDoc(overrides: Record<string, unknown>) {
    state.queryGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'case1',
          data: () => ({
            share_token: 'tok',
            share_issued_at: issued,
            share_expires_at: expires,
            share_revoked: false,
            ...overrides,
          }),
        },
      ],
    });
  }

  it('returns {caseId} when valid (now < expires, not revoked)', async () => {
    mockCaseDoc({});
    const res = await validateShareToken('tok', new Date('2026-06-22T13:00:00.000Z'));
    expect(res).toEqual({ caseId: 'case1' });
    expect(state.whereMock).toHaveBeenCalledWith('share_token', '==', 'tok');
  });

  it('returns null when expired (now == issue + 4h)', async () => {
    mockCaseDoc({});
    const res = await validateShareToken('tok', new Date(expires));
    expect(res).toBeNull();
  });

  it('returns null when expired (now > issue + 4h + 1s)', async () => {
    mockCaseDoc({});
    const res = await validateShareToken(
      'tok',
      new Date(new Date(expires).getTime() + 1000)
    );
    expect(res).toBeNull();
  });

  it('returns null when revoked', async () => {
    mockCaseDoc({ share_revoked: true });
    const res = await validateShareToken('tok', new Date('2026-06-22T13:00:00.000Z'));
    expect(res).toBeNull();
  });

  it('returns null when token is unknown', async () => {
    state.queryGetMock.mockResolvedValue({ empty: true, docs: [] });
    const res = await validateShareToken('nope', new Date('2026-06-22T13:00:00.000Z'));
    expect(res).toBeNull();
  });

  it('returns null when the case was never issued a link (no expiry set)', async () => {
    mockCaseDoc({ share_issued_at: null, share_expires_at: null });
    const res = await validateShareToken('tok', new Date('2026-06-22T13:00:00.000Z'));
    expect(res).toBeNull();
  });
});
