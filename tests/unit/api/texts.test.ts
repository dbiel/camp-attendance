/**
 * /api/texts route tests — GET list (+tag filter), PATCH retag, DELETE dismiss.
 * All super-admin-only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listTextsMock,
  retagTextMock,
  dismissTextMock,
  verifyIdTokenMock,
  getAdminRoleMock,
  isAdminEmailMock,
  bootstrapAdminIfEmptyMock,
} = vi.hoisted(() => ({
  listTextsMock: vi.fn(),
  retagTextMock: vi.fn(),
  dismissTextMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  getAdminRoleMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
  bootstrapAdminIfEmptyMock: vi.fn(),
}));

vi.mock('@/lib/texts', () => ({
  listTexts: listTextsMock,
  retagText: retagTextMock,
  dismissText: dismissTextMock,
}));

vi.mock('@/lib/firestore', () => ({
  getAdminRole: getAdminRoleMock,
  isAdminEmail: isAdminEmailMock,
  bootstrapAdminIfEmpty: bootstrapAdminIfEmptyMock,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {},
}));

import { GET } from '@/app/api/texts/route';
import { PATCH, DELETE } from '@/app/api/texts/[id]/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function req(url: string, method = 'GET', body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest(url, {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitForTests();
  verifyIdTokenMock.mockResolvedValue({ uid: 'u', email: 'admin@test.com' });
  getAdminRoleMock.mockResolvedValue('super_admin');
  isAdminEmailMock.mockResolvedValue(true);
  bootstrapAdminIfEmptyMock.mockResolvedValue(false);
});

describe('GET /api/texts', () => {
  it('returns 401 when unauthenticated', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('no token'));
    const res = await GET(req('http://localhost/api/texts', 'GET', undefined, {}), { params: {} });
    expect(res.status).toBe(401);
    expect(listTextsMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a lookup_admin', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await GET(req('http://localhost/api/texts'), { params: {} });
    expect(res.status).toBe(403);
    expect(listTextsMock).not.toHaveBeenCalled();
  });

  it('returns the list for a super_admin', async () => {
    listTextsMock.mockResolvedValue([{ id: 'A', tag: 'camp' }]);
    const res = await GET(req('http://localhost/api/texts'), { params: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).texts).toHaveLength(1);
    expect(listTextsMock).toHaveBeenCalledWith({});
  });

  it('passes a valid tag filter through', async () => {
    listTextsMock.mockResolvedValue([]);
    await GET(req('http://localhost/api/texts?tag=personal'), { params: {} });
    expect(listTextsMock).toHaveBeenCalledWith({ tag: 'personal' });
  });

  it('ignores tag=all (no filter)', async () => {
    listTextsMock.mockResolvedValue([]);
    await GET(req('http://localhost/api/texts?tag=all'), { params: {} });
    expect(listTextsMock).toHaveBeenCalledWith({});
  });

  it('ignores an invalid tag value', async () => {
    listTextsMock.mockResolvedValue([]);
    await GET(req('http://localhost/api/texts?tag=bogus'), { params: {} });
    expect(listTextsMock).toHaveBeenCalledWith({});
  });
});

describe('PATCH /api/texts/[id]', () => {
  it('returns 403 for a lookup_admin', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await PATCH(req('http://localhost/api/texts/A', 'PATCH', { tag: 'personal' }), {
      params: { id: 'A' },
    });
    expect(res.status).toBe(403);
    expect(retagTextMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid tag', async () => {
    const res = await PATCH(req('http://localhost/api/texts/A', 'PATCH', { tag: 'nope' }), {
      params: { id: 'A' },
    });
    expect(res.status).toBe(400);
    expect(retagTextMock).not.toHaveBeenCalled();
  });

  it('retags with a default manual reason', async () => {
    retagTextMock.mockResolvedValue(undefined);
    const res = await PATCH(req('http://localhost/api/texts/A', 'PATCH', { tag: 'personal' }), {
      params: { id: 'A' },
    });
    expect(res.status).toBe(200);
    expect(retagTextMock).toHaveBeenCalledWith('A', 'personal', expect.stringMatching(/manual/i));
  });

  it('honors an explicit reason', async () => {
    retagTextMock.mockResolvedValue(undefined);
    await PATCH(req('http://localhost/api/texts/A', 'PATCH', { tag: 'camp', reason: 'real report' }), {
      params: { id: 'A' },
    });
    expect(retagTextMock).toHaveBeenCalledWith('A', 'camp', 'real report');
  });
});

describe('DELETE /api/texts/[id]', () => {
  it('returns 403 for a lookup_admin', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await DELETE(req('http://localhost/api/texts/A', 'DELETE'), { params: { id: 'A' } });
    expect(res.status).toBe(403);
    expect(dismissTextMock).not.toHaveBeenCalled();
  });

  it('dismisses for a super_admin', async () => {
    dismissTextMock.mockResolvedValue(undefined);
    const res = await DELETE(req('http://localhost/api/texts/A', 'DELETE'), { params: { id: 'A' } });
    expect(res.status).toBe(200);
    expect(dismissTextMock).toHaveBeenCalledWith('A');
  });
});
