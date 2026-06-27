/**
 * /api/admin/wipe — Clear-All-Data route tests. super-admin-only, server-side
 * RESET confirmation, and only the hard-coded collection allowlist is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  recursiveDeleteMock,
  countDocsMock,
  verifyIdTokenMock,
  getAdminRoleMock,
  isAdminEmailMock,
  bootstrapAdminIfEmptyMock,
} = vi.hoisted(() => ({
  recursiveDeleteMock: vi.fn(),
  countDocsMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  getAdminRoleMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
  bootstrapAdminIfEmptyMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    recursiveDelete: recursiveDeleteMock,
    collection: (name: string) => ({ _name: name }),
  },
}));

vi.mock('@/lib/firestore', () => ({
  getAdminRole: getAdminRoleMock,
  isAdminEmail: isAdminEmailMock,
  bootstrapAdminIfEmpty: bootstrapAdminIfEmptyMock,
  countDocs: countDocsMock,
}));

import { POST } from '@/app/api/admin/wipe/route';
import { WIPE_COLLECTIONS } from '@/lib/wipe';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function req(body?: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/admin/wipe', {
    method: 'POST',
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
  countDocsMock.mockResolvedValue(0);
});

describe('POST /api/admin/wipe', () => {
  it('wipes every allowlisted collection for a super admin with RESET', async () => {
    const res = await POST(req({ confirm: 'RESET' }), { params: {} } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cleared).toEqual([...WIPE_COLLECTIONS]);
    expect(recursiveDeleteMock).toHaveBeenCalledTimes(WIPE_COLLECTIONS.length);
    const deleted = recursiveDeleteMock.mock.calls.map((c) => (c[0] as { _name: string })._name);
    expect(deleted.sort()).toEqual([...WIPE_COLLECTIONS].sort());
  });

  it('never touches config, admins, texts, attendance, or contacts', () => {
    for (const forbidden of ['config', 'admins', 'texts', 'attendance', 'contacts', 'ingest_state']) {
      expect(WIPE_COLLECTIONS as readonly string[]).not.toContain(forbidden);
    }
  });

  it('rejects a wrong confirmation string without deleting anything', async () => {
    const res = await POST(req({ confirm: 'reset' }), { params: {} } as never);
    expect(res.status).toBe(400);
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
  });

  it('rejects a missing body without deleting anything', async () => {
    const res = await POST(req(undefined), { params: {} } as never);
    expect(res.status).toBe(400);
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
  });

  it('forbids a lookup_admin (403) and deletes nothing', async () => {
    getAdminRoleMock.mockResolvedValue('lookup_admin');
    const res = await POST(req({ confirm: 'RESET' }), { params: {} } as never);
    expect(res.status).toBe(403);
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller (401) and deletes nothing', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('bad token'));
    const res = await POST(req({ confirm: 'RESET' }, {}), { params: {} } as never);
    expect(res.status).toBe(401);
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
  });
});
