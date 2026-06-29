import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  resolvePickerTargets: vi.fn(),
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('@/lib/ensemble-links', () => ({ resolvePickerTargets: h.resolvePickerTargets }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: h.checkRateLimit, getClientIp: h.getClientIp }));

import { GET } from '@/app/api/e/pick/[token]/route';

const req = () => ({ headers: new Headers(), url: 'http://x/api/e/pick/tok' }) as unknown as NextRequest;

beforeEach(() => {
  h.resolvePickerTargets.mockReset();
  h.checkRateLimit.mockReset().mockReturnValue(true);
});

describe('GET /api/e/pick/[token]', () => {
  it('returns items on a valid selector token', async () => {
    h.resolvePickerTargets.mockResolvedValue([{ ensemble: 'Band 1', token: 'b1', count: 73 }]);
    const res = await GET(req(), { params: { token: 'tok' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ ensemble: 'Band 1', token: 'b1', count: 73 }] });
  });
  it('uniform 404 when resolver returns null (unknown/revoked/non-selector)', async () => {
    h.resolvePickerTargets.mockResolvedValue(null);
    const res = await GET(req(), { params: { token: 'bad' } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'This link is no longer valid.' });
  });
  it('429 when rate-limited', async () => {
    h.checkRateLimit.mockReturnValue(false);
    const res = await GET(req(), { params: { token: 'tok' } });
    expect(res.status).toBe(429);
    expect(h.resolvePickerTargets).not.toHaveBeenCalled();
  });
});
