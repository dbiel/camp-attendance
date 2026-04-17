import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { setCampConfigMock, loadActiveCampServerMock, invalidateCampConfigCacheMock, verifyIdTokenMock } =
  vi.hoisted(() => ({
    setCampConfigMock: vi.fn(),
    loadActiveCampServerMock: vi.fn(),
    invalidateCampConfigCacheMock: vi.fn(),
    verifyIdTokenMock: vi.fn(),
  }));

vi.mock('@/lib/firestore', () => ({
  setCampConfig: setCampConfigMock,
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/camp-config', () => ({
  loadActiveCampServer: loadActiveCampServerMock,
  invalidateCampConfigCache: invalidateCampConfigCacheMock,
  toPublicCampConfig: (c: Record<string, unknown>) => {
    const { camp_code: _camp_code, ...rest } = c;
    return rest;
  },
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

import { PUT } from '@/app/api/config/camp/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

const CTX = { params: {} };

const BASE_CONFIG = {
  camp_id: '2026',
  camp_code: 'ABC12345',
  camp_year: 2026,
  start_date: '2026-06-08',
  end_date: '2026-06-13',
  timezone: 'America/Chicago',
  day_dates: { M: '2026-06-08', T: '2026-06-09' },
};

function put(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/config/camp', {
    method: 'PUT',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  });
}

function noAuthPut(body: unknown) {
  return new NextRequest('http://localhost/api/config/camp', {
    method: 'PUT',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('PUT /api/config/camp', () => {
  beforeEach(() => {
    setCampConfigMock.mockReset();
    setCampConfigMock.mockResolvedValue(BASE_CONFIG);
    loadActiveCampServerMock.mockReset();
    loadActiveCampServerMock.mockResolvedValue(BASE_CONFIG);
    invalidateCampConfigCacheMock.mockReset();
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
    process.env.CAMP_CODE = 'teachercode';
  });

  it('returns 401 when no auth', async () => {
    const res = await PUT(noAuthPut({ timezone: 'America/Chicago' }), CTX);
    expect(res.status).toBe(401);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 403 for teacher role', async () => {
    const res = await PUT(
      put({ timezone: 'America/Chicago' }, { 'X-Camp-Code': 'teachercode' }),
      CTX
    );
    expect(res.status).toBe(403);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('rate-limits repeated unauthorized attempts (429)', async () => {
    const hits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await PUT(noAuthPut({}), CTX);
      hits.push(res.status);
    }
    // First MAX_HITS (5) should be 401, subsequent should be 429.
    expect(hits.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 on invalid timezone', async () => {
    const res = await PUT(put({ timezone: 'Not/A_Real_Zone' }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('timezone');
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when end_date is before start_date', async () => {
    const res = await PUT(
      put({ start_date: '2026-06-13', end_date: '2026-06-08' }),
      CTX
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/end_date|start_date|order/);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 on bad ISO in start_date', async () => {
    const res = await PUT(put({ start_date: '6/8/2026' }), CTX);
    expect(res.status).toBe(400);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 on bad day_dates value (non-ISO)', async () => {
    const res = await PUT(
      put({ day_dates: { M: 'not-a-date', T: '2026-06-09' } }),
      CTX
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('day_dates');
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when day_dates is not an object', async () => {
    const res = await PUT(put({ day_dates: 'bogus' }), CTX);
    expect(res.status).toBe(400);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when name is empty string', async () => {
    const res = await PUT(put({ name: '' }), CTX);
    expect(res.status).toBe(400);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('rejects attempts to set camp_code directly (400)', async () => {
    const res = await PUT(put({ camp_code: 'HACKED01' }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('camp_code');
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('rejects attempts to set camp_id directly (400)', async () => {
    const res = await PUT(put({ camp_id: '2027' }), CTX);
    expect(res.status).toBe(400);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });

  it('returns 200 on happy path and forwards the partial to setCampConfig', async () => {
    const updated = {
      ...BASE_CONFIG,
      start_date: '2026-06-09',
      end_date: '2026-06-14',
    };
    setCampConfigMock.mockResolvedValue(updated);
    const partial = {
      start_date: '2026-06-09',
      end_date: '2026-06-14',
      timezone: 'America/Chicago',
      day_dates: { M: '2026-06-09', T: '2026-06-10' },
    };
    const res = await PUT(put(partial), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(updated);
    // Admin sees camp_code.
    expect(body.camp_code).toBe('ABC12345');
    expect(setCampConfigMock).toHaveBeenCalledTimes(1);
    expect(setCampConfigMock).toHaveBeenCalledWith(partial);
  });

  it('accepts a single valid field update (name only, via camp_year-style partial)', async () => {
    // Our CampConfig has no `name` field — use another allowed partial.
    const res = await PUT(put({ timezone: 'America/Chicago' }), CTX);
    expect(res.status).toBe(200);
    expect(setCampConfigMock).toHaveBeenCalledWith({ timezone: 'America/Chicago' });
  });

  it('returns 400 when body is not JSON', async () => {
    const req = new NextRequest('http://localhost/api/config/camp', {
      method: 'PUT',
      headers: new Headers({
        'content-type': 'application/json',
        Authorization: 'Bearer fake',
      }),
      body: 'not json',
    });
    const res = await PUT(req, CTX);
    expect(res.status).toBe(400);
    expect(setCampConfigMock).not.toHaveBeenCalled();
  });
});
