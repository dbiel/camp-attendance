import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  issueShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
  getCase: vi.fn(),
  getAdminRole: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/cases', () => ({
  issueShareLink: m.issueShareLink,
  revokeShareLink: m.revokeShareLink,
  getCase: m.getCase,
}));
vi.mock('@/lib/firestore', () => ({ getAdminRole: m.getAdminRole }));
vi.mock('@/lib/auth', () => ({ verifyAdmin: m.verifyAdmin, getCallerRole: vi.fn() }));

import { POST, DELETE } from '@/app/api/cases/[id]/share/route';

function req(method: string, body?: unknown) {
  return new NextRequest('http://test/api/cases/c1/share', {
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

describe('POST /api/cases/[id]/share', () => {
  it('issues a link and returns url + expiry', async () => {
    m.getCase.mockResolvedValue({ id: 'c1', status: 'active' });
    m.issueShareLink.mockResolvedValue({ token: 'abc', url: '/r/abc', expires_at: '2026-06-22T16:00:00.000Z' });
    const res = await POST(req('POST', { recipient_label: 'Counselor Jane' }), { params: { id: 'c1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toBe('/r/abc');
    expect(data.expires_at).toBe('2026-06-22T16:00:00.000Z');
    expect(m.issueShareLink).toHaveBeenCalledWith('c1', 'Counselor Jane', expect.any(Date));
  });

  it('404s on unknown case', async () => {
    m.getCase.mockResolvedValue(null);
    const res = await POST(req('POST', { recipient_label: 'x' }), { params: { id: 'nope' } });
    expect(res.status).toBe(404);
    expect(m.issueShareLink).not.toHaveBeenCalled();
  });

  it('403s for lookup_admin (share-issue stays super_admin)', async () => {
    m.getAdminRole.mockResolvedValue('lookup_admin');
    const res = await POST(req('POST', { recipient_label: 'x' }), { params: { id: 'c1' } });
    expect(res.status).toBe(403);
    expect(m.issueShareLink).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/cases/[id]/share', () => {
  it('revokes the link', async () => {
    m.getCase.mockResolvedValue({ id: 'c1', status: 'active' });
    m.revokeShareLink.mockResolvedValue(undefined);
    const res = await DELETE(req('DELETE'), { params: { id: 'c1' } });
    expect(res.status).toBe(200);
    expect(m.revokeShareLink).toHaveBeenCalledWith('c1');
  });

  it('403s for lookup_admin', async () => {
    m.getAdminRole.mockResolvedValue('lookup_admin');
    const res = await DELETE(req('DELETE'), { params: { id: 'c1' } });
    expect(res.status).toBe(403);
    expect(m.revokeShareLink).not.toHaveBeenCalled();
  });
});
