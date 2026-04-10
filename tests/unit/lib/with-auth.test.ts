import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/with-auth';

vi.mock('@/lib/auth', () => ({
  getCallerRole: vi.fn(),
}));

import { getCallerRole } from '@/lib/auth';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/test');
}

describe('withAuth', () => {
  beforeEach(() => {
    vi.mocked(getCallerRole).mockReset();
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
});
