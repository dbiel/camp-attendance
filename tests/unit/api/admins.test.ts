/**
 * Admin Allowlist API Tests
 *
 * Covers GET/POST /api/admins, DELETE/PATCH /api/admins/[email],
 * POST /api/admins/[email]/password.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listAdminsMock,
  addAdminMock,
  removeAdminMock,
  setAdminRoleMock,
  getAdminRoleMock,
  countSuperAdminsMock,
  isAdminEmailMock,
  bootstrapAdminIfEmptyMock,
  verifyIdTokenMock,
  createPasswordAdminMock,
  resetAdminPasswordMock,
} = vi.hoisted(() => ({
  listAdminsMock: vi.fn(),
  addAdminMock: vi.fn(),
  removeAdminMock: vi.fn(),
  setAdminRoleMock: vi.fn(),
  getAdminRoleMock: vi.fn(),
  countSuperAdminsMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
  bootstrapAdminIfEmptyMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  createPasswordAdminMock: vi.fn(),
  resetAdminPasswordMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  listAdmins: listAdminsMock,
  addAdmin: addAdminMock,
  removeAdmin: removeAdminMock,
  setAdminRole: setAdminRoleMock,
  getAdminRole: getAdminRoleMock,
  countSuperAdmins: countSuperAdminsMock,
  isAdminEmail: isAdminEmailMock,
  bootstrapAdminIfEmpty: bootstrapAdminIfEmptyMock,
}));

vi.mock('@/lib/admin-users', () => ({
  createPasswordAdmin: createPasswordAdminMock,
  resetAdminPassword: resetAdminPasswordMock,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) },
}));

import { GET, POST } from '@/app/api/admins/route';
import { DELETE, PATCH } from '@/app/api/admins/[email]/route';
import { POST as RESET } from '@/app/api/admins/[email]/password/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

const CTX = { params: {} };

function req(method: string, body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/admins', {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function idReq(method: string, body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/admins/target', {
    method,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitForTests();

  // Caller is a super admin by default.
  verifyIdTokenMock.mockResolvedValue({ uid: 'admin-uid', email: 'admin@test.com' });
  isAdminEmailMock.mockResolvedValue(true);
  bootstrapAdminIfEmptyMock.mockResolvedValue(false);
  getAdminRoleMock.mockResolvedValue('super_admin');
  countSuperAdminsMock.mockResolvedValue(2);
});

describe('GET /api/admins', () => {
  it('returns 401 when unauthenticated', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('no token'));
    const res = await GET(req('GET', undefined, {}), CTX);
    expect(res.status).toBe(401);
    expect(listAdminsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated but only a lookup_admin', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await GET(req('GET'), CTX);
    expect(res.status).toBe(403);
    expect(listAdminsMock).not.toHaveBeenCalled();
  });

  it('returns 200 with the admin list', async () => {
    listAdminsMock.mockResolvedValue([
      { email: 'admin@test.com', added_by: 'bootstrap', added_at: 1, role: 'super_admin', auth_type: 'google' },
    ]);
    const res = await GET(req('GET'), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admins).toHaveLength(1);
    expect(body.admins[0].role).toBe('super_admin');
  });
});

describe('POST /api/admins (Google)', () => {
  it('returns 400 for missing email', async () => {
    const res = await POST(req('POST', {}), CTX);
    expect(res.status).toBe(400);
    expect(addAdminMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email format', async () => {
    const res = await POST(req('POST', { email: 'not-an-email' }), CTX);
    expect(res.status).toBe(400);
  });

  it('returns 400 when addAdmin throws (duplicate)', async () => {
    addAdminMock.mockRejectedValue(new Error('Admin already exists'));
    const res = await POST(req('POST', { email: 'dup@test.com' }), CTX);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('already');
  });

  it('adds a Google admin with the chosen role (defaults lookup_admin)', async () => {
    addAdminMock.mockResolvedValue(undefined);
    const res = await POST(req('POST', { email: 'NEW@Test.com' }), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe('new@test.com');
    expect(body.role).toBe('lookup_admin');
    expect(body.auth_type).toBe('google');
    expect(addAdminMock).toHaveBeenCalledWith('new@test.com', 'admin@test.com', 'lookup_admin');
  });

  it('honors role: super_admin', async () => {
    addAdminMock.mockResolvedValue(undefined);
    const res = await POST(req('POST', { email: 'boss@test.com', role: 'super_admin' }), CTX);
    expect(res.status).toBe(200);
    expect(addAdminMock).toHaveBeenCalledWith('boss@test.com', 'admin@test.com', 'super_admin');
  });

  it('returns 403 when caller is only a lookup_admin', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await POST(req('POST', { email: 'x@y.com' }), CTX);
    expect(res.status).toBe(403);
    expect(addAdminMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admins (password account)', () => {
  it('requires a name', async () => {
    const res = await POST(req('POST', { auth_type: 'password' }), CTX);
    expect(res.status).toBe(400);
    expect(createPasswordAdminMock).not.toHaveBeenCalled();
  });

  it('creates a password account and returns a setup link', async () => {
    createPasswordAdminMock.mockResolvedValue({ email: 'jane@camp.local', setup_link: 'https://l/x' });
    const res = await POST(
      req('POST', { auth_type: 'password', name: 'Jane Smith', mode: 'setup_link', role: 'lookup_admin' }),
      CTX
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.setup_link).toBe('https://l/x');
    expect(body.auth_type).toBe('password');
    expect(createPasswordAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane Smith', role: 'lookup_admin', mode: 'setup_link', addedBy: 'admin@test.com' })
    );
  });
});

describe('DELETE /api/admins/[email]', () => {
  it('blocks self-removal', async () => {
    const res = await DELETE(idReq('DELETE'), { params: { email: 'admin@test.com' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Cannot remove yourself');
    expect(removeAdminMock).not.toHaveBeenCalled();
  });

  it('blocks removing the last super admin', async () => {
    getAdminRoleMock.mockResolvedValue('super_admin');
    countSuperAdminsMock.mockResolvedValue(1);
    const res = await DELETE(idReq('DELETE'), { params: { email: 'other@test.com' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('last super admin');
    expect(removeAdminMock).not.toHaveBeenCalled();
  });

  it('removes a lookup_admin successfully', async () => {
    getAdminRoleMock.mockImplementation(async (e: string) =>
      e === 'admin@test.com' ? 'super_admin' : 'lookup_admin'
    );
    const res = await DELETE(idReq('DELETE'), { params: { email: 'someone@test.com' } });
    expect(res.status).toBe(200);
    expect(removeAdminMock).toHaveBeenCalledWith('someone@test.com');
  });
});

describe('PATCH /api/admins/[email]', () => {
  it('rejects an invalid role', async () => {
    const res = await PATCH(idReq('PATCH', { role: 'viewer' }), { params: { email: 'x@test.com' } });
    expect(res.status).toBe(400);
    expect(setAdminRoleMock).not.toHaveBeenCalled();
  });

  it('changes the role', async () => {
    // Caller stays super_admin; the target is the one being promoted.
    getAdminRoleMock.mockImplementation(async (e: string) =>
      e === 'admin@test.com' ? 'super_admin' : 'lookup_admin'
    );
    const res = await PATCH(idReq('PATCH', { role: 'super_admin' }), { params: { email: 'x@test.com' } });
    expect(res.status).toBe(200);
    expect(setAdminRoleMock).toHaveBeenCalledWith('x@test.com', 'super_admin');
  });

  it('blocks demoting the last super admin', async () => {
    getAdminRoleMock.mockResolvedValue('super_admin');
    countSuperAdminsMock.mockResolvedValue(1);
    const res = await PATCH(idReq('PATCH', { role: 'lookup_admin' }), { params: { email: 'admin@test.com' } });
    expect(res.status).toBe(400);
    expect(setAdminRoleMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admins/[email]/password', () => {
  it('resets via temp password', async () => {
    resetAdminPasswordMock.mockResolvedValue({});
    const res = await RESET(idReq('POST', { mode: 'temp_password', password: 'newpass12' }), {
      params: { email: 'jane@camp.local' },
    });
    expect(res.status).toBe(200);
    expect(resetAdminPasswordMock).toHaveBeenCalledWith('jane@camp.local', 'temp_password', 'newpass12');
  });

  it('returns a fresh setup link', async () => {
    resetAdminPasswordMock.mockResolvedValue({ setup_link: 'https://l/y' });
    const res = await RESET(idReq('POST', { mode: 'setup_link' }), { params: { email: 'jane@camp.local' } });
    expect(res.status).toBe(200);
    expect((await res.json()).setup_link).toBe('https://l/y');
  });

  it('returns 403 for a lookup_admin caller', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await RESET(idReq('POST', { mode: 'setup_link' }), { params: { email: 'jane@camp.local' } });
    expect(res.status).toBe(403);
    expect(resetAdminPasswordMock).not.toHaveBeenCalled();
  });
});
