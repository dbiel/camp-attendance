import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getStudentMock,
  getStudentScheduleForDateMock,
  verifyIdTokenMock,
} = vi.hoisted(() => ({
  getStudentMock: vi.fn(),
  getStudentScheduleForDateMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  getStudent: getStudentMock,
  getStudentScheduleForDate: getStudentScheduleForDateMock,
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
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

import { GET } from '@/app/api/students/[id]/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function makeRequest(
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  const url = new URL('http://localhost/api/students/s1');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: 'GET',
    headers: new Headers(headers),
  });
}

const CTX = { params: { id: 's1' } };

function adminHeaders() {
  return { Authorization: 'Bearer fake' };
}

function mockStudent() {
  return {
    id: 's1',
    first_name: 'John',
    last_name: 'Smith',
    last_initial: 'S',
    division: 'HS',
    instrument: 'Trumpet',
    ensemble: 'Wind Ensemble',
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('GET /api/students/[id] (with_schedule)', () => {
  beforeEach(() => {
    getStudentMock.mockReset();
    getStudentMock.mockResolvedValue(mockStudent());
    getStudentScheduleForDateMock.mockReset();
    getStudentScheduleForDateMock.mockResolvedValue([]);
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
  });

  it('returns 200 without schedule_for_date when with_schedule not set', async () => {
    const res = await GET(makeRequest({}, adminHeaders()), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('s1');
    expect(body.first_name).toBe('John');
    expect(body.schedule_for_date).toBeUndefined();
    expect(getStudentScheduleForDateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when with_schedule=1 but date missing', async () => {
    const res = await GET(
      makeRequest({ with_schedule: '1' }, adminHeaders()),
      CTX
    );
    expect(res.status).toBe(400);
    expect(getStudentScheduleForDateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when date is not ISO formatted (bad string)', async () => {
    const res = await GET(
      makeRequest({ with_schedule: '1', date: 'bad' }, adminHeaders()),
      CTX
    );
    expect(res.status).toBe(400);
    expect(getStudentScheduleForDateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when date missing leading zeros (2026-6-8)', async () => {
    const res = await GET(
      makeRequest({ with_schedule: '1', date: '2026-6-8' }, adminHeaders()),
      CTX
    );
    expect(res.status).toBe(400);
    expect(getStudentScheduleForDateMock).not.toHaveBeenCalled();
  });

  it('returns 200 with schedule_for_date when valid', async () => {
    getStudentScheduleForDateMock.mockResolvedValue([
      {
        session_id: 'sess1',
        session_name: 'Full Orchestra',
        period_name: 'Period 1',
        start_time: '08:00',
        end_time: '09:00',
        location: 'Hall A',
        status: 'present',
      },
      {
        session_id: 'sess2',
        session_name: 'Sectional',
        period_name: 'Period 2',
        start_time: '09:15',
        end_time: '10:00',
        location: null,
        status: 'unmarked',
      },
    ]);
    const res = await GET(
      makeRequest(
        { with_schedule: '1', date: '2026-06-08' },
        adminHeaders()
      ),
      CTX
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('s1');
    expect(Array.isArray(body.schedule_for_date)).toBe(true);
    expect(body.schedule_for_date).toHaveLength(2);
    expect(body.schedule_for_date[0]).toMatchObject({
      session_id: 'sess1',
      session_name: 'Full Orchestra',
      period_name: 'Period 1',
      start_time: '08:00',
      end_time: '09:00',
      location: 'Hall A',
      status: 'present',
    });
    expect(getStudentScheduleForDateMock).toHaveBeenCalledWith('s1', '2026-06-08');
  });

  it('propagates unmarked status for sessions with no attendance record', async () => {
    getStudentScheduleForDateMock.mockResolvedValue([
      {
        session_id: 'sessX',
        session_name: 'Something',
        period_name: 'Period 3',
        start_time: '10:00',
        end_time: '11:00',
        location: null,
        status: 'unmarked',
      },
    ]);
    const res = await GET(
      makeRequest(
        { with_schedule: '1', date: '2026-06-08' },
        adminHeaders()
      ),
      CTX
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule_for_date[0].status).toBe('unmarked');
  });
});
