/**
 * Admin Allowlist API Tests
 *
 * Covers GET /api/admins, POST /api/admins, DELETE /api/admins/[email].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listAdminsMock,
  addAdminMock,
  removeAdminMock,
  isAdminEmailMock,
  bootstrapAdminIfEmptyMock,
  verifyIdTokenMock,
} = vi.hoisted(() => ({
  listAdminsMock: vi.fn(),
  addAdminMock: vi.fn(),
  removeAdminMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
  bootstrapAdminIfEmptyMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  listAdmins: listAdminsMock,
  addAdmin: addAdminMock,
  removeAdmin: removeAdminMock,
  isAdminEmail: isAdminEmailMock,
  bootstrapAdminIfEmpty: bootstrapAdminIfEmptyMock,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  },
}));

import { GET, POST } from '@/app/api/admins/route';
import { DELETE } from '@/app/api/admins/[email]/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

const CTX = { params: {} };

function req(method: string, body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/admins', {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function delReq(headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/admins/target', {
    method: 'DELETE',
    headers: new Headers(headers),
  });
}

beforeEach(() => {
  listAdminsMock.mockReset();
  addAdminMock.mockReset();
  removeAdminMock.mockReset();
  isAdminEmailMock.mockReset();
  bootstrapAdminIfEmptyMock.mockReset();
  verifyIdTokenMock.mockReset();
  _resetRateLimitForTests();

  // Defaults: caller is an allow-listed admin.
  verifyIdTokenMock.mockResolvedValue({ uid: 'admin-uid', email: 'admin@test.com' });
  isAdminEmailMock.mockResolvedValue(true);
  bootstrapAdminIfEmptyMock.mockResolvedValue(false);
});

describe('GET /api/admins', () => {
  it('returns 401 when unauthenticated', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('no token'));
    const res = await GET(req('GET', undefined, {}), CTX);
    expect(res.status).toBe(401);
    expect(listAdminsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when authenticated but not on allowlist', async () => {
    isAdminEmailMock.mockResolvedValue(false);
    bootstrapAdminIfEmptyMock.mockResolvedValue(false);
    const res = await GET(req('GET'), CTX);
    expect(res.status).toBe(401);
    expect(listAdminsMock).not.toHaveBeenCalled();
  });

  it('returns 200 with the admin list', async () => {
    listAdminsMock.mockResolvedValue([
      { email: 'admin@test.com', added_by: 'bootstrap', added_at: 1 },
      { email: 'bob@test.com', added_by: 'admin@test.com', added_at: 2 },
    ]);
    const res = await GET(req('GET'), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admins).toHaveLength(2);
    expect(body.admins[0]).toEqual({ email: 'admin@test.com', added_by: 'bootstrap', added_at: 1 });
  });
});

describe('POST /api/admins', () => {
  it('returns 400 for missing email', async () => {
    const res = await POST(req('POST', {}), CTX);
    expect(res.status).toBe(400);
    expect(addAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email format', async () => {
    const res = await POST(req('POST', { email: 'not-an-email' }), CTX);
    expect(res.status).toBe(400);
    expect(addAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 when addAdmin throws (duplicate)', async () => {
    addAdminMock.mockRejectedValue(new Error('Admin already exists'));
    const res = await POST(req('POST', { email: 'dup@test.com' }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already');
  });

  it('returns 200 with the new admin record on success', async () => {
    addAdminMock.mockResolvedValue(undefined);
    const res = await POST(req('POST', { email: 'NEW@Test.com' }), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe('new@test.com');
    expect(body.added_by).toBe('admin@test.com');
    expect(typeof body.added_at).toBe('number');
    expect(addAdminMock).toHaveBeenCalledWith('new@test.com', 'admin@test.com');
  });

  it('returns 401 when unauthenticated', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('no token'));
    const res = await POST(req('POST', { email: 'x@y.com' }, {}), CTX);
    expect(res.status).toBe(401);
    expect(addAdminMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admins/[email]', () => {
  it('returns 400 when removing self', async () => {
    // Caller email matches the target email.
    const res = await DELETE(delReq(), { params: { email: 'admin@test.com' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Cannot remove yourself');
    expect(removeAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 when removing self (case-insensitive)', async () => {
    const res = await DELETE(delReq(), { params: { email: 'ADMIN@test.com' } });
    expect(res.status).toBe(400);
    expect(removeAdminMock).not.toHaveBeenCalled();
  });

  it('returns 200 on successful removal', async () => {
    removeAdminMock.mockResolvedValue(undefined);
    const res = await DELETE(delReq(), { params: { email: 'someone@test.com' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(removeAdminMock).toHaveBeenCalledWith('someone@test.com');
  });

  it('returns 401 when unauthenticated', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('no token'));
    const res = await DELETE(delReq({}), { params: { email: 'someone@test.com' } });
    expect(res.status).toBe(401);
    expect(removeAdminMock).not.toHaveBeenCalled();
  });
});
