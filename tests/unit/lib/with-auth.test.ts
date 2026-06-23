import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/with-auth';

vi.mock('@/lib/auth', () => ({
  getCallerRole: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  getAdminRole: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));

import { getCallerRole, verifyAdmin } from '@/lib/auth';
import { getAdminRole } from '@/lib/firestore';
import { checkRateLimit } from '@/lib/rate-limit';

type DecodedToken = Awaited<ReturnType<typeof verifyAdmin>>;

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/test');
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.mocked(getCallerRole).mockReset();
    vi.mocked(verifyAdmin).mockReset();
    vi.mocked(getAdminRole).mockReset();
    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it('returns 401 when no role', async () => {
    vi.mocked(getCallerRole).mockResolvedValue(null);
    const handler = withAuth('teacher', async () => new Response('ok'));
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when role is insufficient', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('teacher');
    const handler = withAuth('admin', async () => new Response('ok'));
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Admin access required' });
  });

  it('calls handler when role is sufficient', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('admin');
    const inner = vi.fn(async () => Response.json({ ok: true }));
    const handler = withAuth('admin', inner);
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledOnce();
    const call = (inner.mock.calls[0] as unknown as [unknown, { role: string }]);
    expect(call[1].role).toBe('admin');
  });

  it('returns 500 and logs on handler throw', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('admin');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = withAuth('admin', async () => { throw new Error('boom'); });
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('teacher requirement accepts both teacher and admin', async () => {
    vi.mocked(getCallerRole).mockResolvedValue('teacher');
    const handler = withAuth('teacher', async () => Response.json({ ok: true }));
    const res = await handler(makeReq(), { params: {} });
    expect(res.status).toBe(200);
  });

  describe('super_admin requirement', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue(null);
      const handler = withAuth('super_admin', async () => new Response('ok'));
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
      expect(getAdminRole).not.toHaveBeenCalled();
    });

    it('returns 429 when unauthenticated and rate limit bucket is exhausted', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue(null);
      vi.mocked(checkRateLimit).mockReturnValue(false);
      const handler = withAuth('super_admin', async () => new Response('ok'), {
        rateLimitKey: 'test',
      });
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body).toEqual({ error: 'Too many requests' });
      expect(checkRateLimit).toHaveBeenCalledWith('test:1.2.3.4');
    });

    it('returns 403 when authenticated but role is lookup_admin', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue({ email: 'john@test.com' } as DecodedToken);
      vi.mocked(getAdminRole).mockResolvedValue('lookup_admin');
      const handler = withAuth('super_admin', async () => new Response('ok'));
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: 'Super admin access required' });
    });

    it('calls handler with role admin when caller is super_admin', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue({ email: 'boss@test.com' } as DecodedToken);
      vi.mocked(getAdminRole).mockResolvedValue('super_admin');
      const inner = vi.fn(async () => Response.json({ ok: true }));
      const handler = withAuth('super_admin', inner);
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(200);
      expect(inner).toHaveBeenCalledOnce();
      const call = (inner.mock.calls[0] as unknown as [unknown, { role: string }]);
      expect(call[1].role).toBe('admin');
      expect(getAdminRole).toHaveBeenCalledWith('boss@test.com');
    });
  });

  describe('lookup_admin requirement', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue(null);
      const handler = withAuth('lookup_admin', async () => new Response('ok'));
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(401);
      expect(getAdminRole).not.toHaveBeenCalled();
    });

    it('returns 403 when authenticated but not on the admin allowlist', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue({ email: 'nobody@test.com' } as DecodedToken);
      vi.mocked(getAdminRole).mockResolvedValue(null);
      const handler = withAuth('lookup_admin', async () => new Response('ok'));
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: 'Admin access required' });
    });

    it('accepts a lookup_admin and passes role lookup_admin', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue({ email: 'helper@test.com' } as DecodedToken);
      vi.mocked(getAdminRole).mockResolvedValue('lookup_admin');
      const inner = vi.fn(async () => Response.json({ ok: true }));
      const handler = withAuth('lookup_admin', inner);
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(200);
      const call = (inner.mock.calls[0] as unknown as [unknown, { role: string }]);
      expect(call[1].role).toBe('lookup_admin');
    });

    it('accepts a super_admin and passes role admin (tier preserved)', async () => {
      vi.mocked(verifyAdmin).mockResolvedValue({ email: 'boss@test.com' } as DecodedToken);
      vi.mocked(getAdminRole).mockResolvedValue('super_admin');
      const inner = vi.fn(async () => Response.json({ ok: true }));
      const handler = withAuth('lookup_admin', inner);
      const res = await handler(makeReq(), { params: {} });
      expect(res.status).toBe(200);
      const call = (inner.mock.calls[0] as unknown as [unknown, { role: string }]);
      expect(call[1].role).toBe('admin');
    });
  });
});
