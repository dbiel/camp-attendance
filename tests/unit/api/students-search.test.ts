import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { searchStudentsMock, verifyIdTokenMock } = vi.hoisted(() => ({
  searchStudentsMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  searchStudents: searchStudentsMock,
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
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

import { GET } from '@/app/api/students/search/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

const CTX = { params: {} };

function makeRequest(
  params: Record<string, string>,
  headers: Record<string, string> = {}
) {
  const url = new URL('http://localhost/api/students/search');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: 'GET',
    headers: new Headers(headers),
  });
}

function adminHeaders(extra: Record<string, string> = {}) {
  return { Authorization: 'Bearer fake', ...extra };
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    first_name: 'John',
    last_name: 'Smith',
    preferred_name: null,
    instrument: 'Trumpet',
    ensemble: 'Wind Ensemble',
    dorm_building: 'Horn',
    dorm_room: '101',
    ...overrides,
  };
}

describe('GET /api/students/search', () => {
  beforeEach(() => {
    searchStudentsMock.mockReset();
    searchStudentsMock.mockResolvedValue({ results: [], total: 0, truncated: false });
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
    process.env.CAMP_CODE = 'teachercode';
  });

  it('returns 401 when no auth', async () => {
    const res = await GET(makeRequest({ q: 'john' }), CTX);
    expect(res.status).toBe(401);
    expect(searchStudentsMock).not.toHaveBeenCalled();
  });

  it('returns 403 for teacher role', async () => {
    const res = await GET(
      makeRequest({ q: 'john' }, { 'X-Camp-Code': 'teachercode' }),
      CTX
    );
    expect(res.status).toBe(403);
    expect(searchStudentsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when q is missing', async () => {
    const res = await GET(makeRequest({}, adminHeaders()), CTX);
    expect(res.status).toBe(400);
    expect(searchStudentsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when q is empty', async () => {
    const res = await GET(makeRequest({ q: '' }, adminHeaders()), CTX);
    expect(res.status).toBe(400);
    expect(searchStudentsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when q has fewer than 2 chars', async () => {
    const res = await GET(makeRequest({ q: 'j' }, adminHeaders()), CTX);
    expect(res.status).toBe(400);
    expect(searchStudentsMock).not.toHaveBeenCalled();
  });

  it('returns 200 and passes query and default limit to firestore helper', async () => {
    searchStudentsMock.mockResolvedValue({
      results: [makeResult()],
      total: 1,
      truncated: false,
    });
    const res = await GET(makeRequest({ q: 'john' }, adminHeaders()), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      id: 's1',
      first_name: 'John',
      last_name: 'Smith',
      preferred_name: null,
      instrument: 'Trumpet',
      ensemble: 'Wind Ensemble',
      dorm_building: 'Horn',
      dorm_room: '101',
    });
    expect(body.total).toBe(1);
    expect(body.truncated).toBe(false);
    expect(searchStudentsMock).toHaveBeenCalledTimes(1);
    expect(searchStudentsMock).toHaveBeenCalledWith('john', 50);
  });

  it('respects custom limit query param', async () => {
    searchStudentsMock.mockResolvedValue({ results: [], total: 0, truncated: false });
    await GET(makeRequest({ q: 'john', limit: '5' }, adminHeaders()), CTX);
    expect(searchStudentsMock).toHaveBeenCalledWith('john', 5);
  });

  it('caps limit at 200', async () => {
    searchStudentsMock.mockResolvedValue({ results: [], total: 0, truncated: false });
    await GET(makeRequest({ q: 'john', limit: '9999' }, adminHeaders()), CTX);
    expect(searchStudentsMock).toHaveBeenCalledWith('john', 200);
  });

  it('returns truncated=true when more matches exist beyond limit', async () => {
    const five = Array.from({ length: 5 }, (_, i) => makeResult({ id: `s${i}` }));
    searchStudentsMock.mockResolvedValue({
      results: five,
      total: 5,
      truncated: true,
    });
    const res = await GET(makeRequest({ q: 'john', limit: '5' }, adminHeaders()), CTX);
    const body = await res.json();
    expect(body.results).toHaveLength(5);
    expect(body.truncated).toBe(true);
  });

  it('preserves ranking order returned by helper (exact match first)', async () => {
    searchStudentsMock.mockResolvedValue({
      results: [
        makeResult({ id: 'exact', first_name: 'John', last_name: 'Doe' }),
        makeResult({ id: 'prefix', first_name: 'Johnny', last_name: 'Appleseed' }),
        makeResult({ id: 'substr', first_name: 'Tim', last_name: 'Johnson' }),
      ],
      total: 3,
      truncated: false,
    });
    const res = await GET(makeRequest({ q: 'john' }, adminHeaders()), CTX);
    const body = await res.json();
    expect(body.results.map((r: { id: string }) => r.id)).toEqual([
      'exact',
      'prefix',
      'substr',
    ]);
  });
});
