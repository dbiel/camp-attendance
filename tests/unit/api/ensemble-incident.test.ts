// tests/unit/api/ensemble-incident.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  refs: null as number[] | null,
  detail: null as any,
  update: { ok: true } as any,
  rl: true,
  rlDurable: true,
}));

vi.mock('@/lib/ensemble-incidents', () => ({
  listTodayReportRefs: async () => h.refs,
  getEnsembleReportByRef: async () => h.detail,
  postEnsembleIncidentUpdate: async () => h.update,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => h.rl,
  checkRateLimitDurable: async () => h.rlDurable,
  getClientIp: () => '1.2.3.4',
}));

import { GET } from '@/app/api/e/[token]/incident/[ref]/route';
import { POST } from '@/app/api/e/[token]/incident/[ref]/update/route';

function req(body?: unknown) {
  return new Request('http://x', {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

beforeEach(() => {
  h.refs = null; h.detail = null; h.update = { ok: true }; h.rl = true; h.rlDurable = true;
});

describe('GET incident detail', () => {
  it('200 with the scoped incident', async () => {
    h.detail = { first_name: 'Jane', last_initial: 'D.', instrument: 'Flute', report_summary: 'Absent', status: 'active', updates: [] };
    const res = await GET(req(), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).incident.first_name).toBe('Jane');
  });
  it('uniform 404 when no active incident at the ref', async () => {
    h.detail = null;
    const res = await GET(req(), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(404);
  });
  it('400 on a non-numeric ref', async () => {
    const res = await GET(req(), { params: { token: 't', ref: 'abc' } });
    expect(res.status).toBe(400);
  });
  it('429 when rate-limited', async () => {
    h.rl = false;
    const res = await GET(req(), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(429);
  });
});

describe('POST incident update', () => {
  it('200 on a valid update', async () => {
    const res = await POST(req({ body: 'in the hall' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(200);
  });
  it('400 on empty body', async () => {
    const res = await POST(req({ body: '   ' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(400);
  });
  it('410 when the case is gone/resolved', async () => {
    h.update = { ok: false, reason: 'gone' };
    const res = await POST(req({ body: 'x' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(410);
  });
  it('410 when the token is invalid', async () => {
    h.update = { ok: false, reason: 'invalid' };
    const res = await POST(req({ body: 'x' }), { params: { token: 't', ref: '1' } });
    expect(res.status).toBe(410);
  });
});
