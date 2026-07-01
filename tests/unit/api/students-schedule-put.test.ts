import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getStudentScheduleSessionsMock,
  getSessionMock,
  addStudentToSessionMock,
  removeStudentFromSessionMock,
  verifyIdTokenMock,
} = vi.hoisted(() => ({
  getStudentScheduleSessionsMock: vi.fn(),
  getSessionMock: vi.fn(),
  addStudentToSessionMock: vi.fn(),
  removeStudentFromSessionMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  getStudentSchedule: vi.fn(),
  getStudentScheduleSessions: getStudentScheduleSessionsMock,
  getSession: getSessionMock,
  addStudentToSession: addStudentToSessionMock,
  removeStudentFromSession: removeStudentFromSessionMock,
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
  getAdminRole: vi.fn().mockResolvedValue('super_admin'),
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

import { PUT } from '@/app/api/students/[id]/schedule/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function makeRequest(body: unknown) {
  return new NextRequest(new URL('http://localhost/api/students/s1/schedule'), {
    method: 'PUT',
    headers: new Headers({ Authorization: 'Bearer fake', 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

const CTX = { params: { id: 's1' } };

describe('PUT /api/students/[id]/schedule', () => {
  beforeEach(() => {
    getStudentScheduleSessionsMock.mockReset().mockResolvedValue([]);
    getSessionMock.mockReset();
    addStudentToSessionMock.mockReset().mockResolvedValue(undefined);
    removeStudentFromSessionMock.mockReset().mockResolvedValue(undefined);
    verifyIdTokenMock.mockReset().mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
  });

  it('400s when period_id is missing', async () => {
    const res = await PUT(makeRequest({ session_id: 'sess1' }), CTX);
    expect(res.status).toBe(400);
  });

  it('404s when session_id does not exist', async () => {
    getSessionMock.mockResolvedValue(undefined);
    const res = await PUT(makeRequest({ period_id: 'p1', session_id: 'ghost' }), CTX);
    expect(res.status).toBe(404);
  });

  it("400s when session_id's period doesn't match period_id", async () => {
    getSessionMock.mockResolvedValue({ id: 'sess1', period_id: 'p2' });
    const res = await PUT(makeRequest({ period_id: 'p1', session_id: 'sess1' }), CTX);
    expect(res.status).toBe(400);
  });

  it('adds a new enrollment when the period was previously empty', async () => {
    getSessionMock.mockResolvedValue({ id: 'sess1', period_id: 'p1' });
    getStudentScheduleSessionsMock.mockResolvedValue([]);
    const res = await PUT(makeRequest({ period_id: 'p1', session_id: 'sess1' }), CTX);
    expect(res.status).toBe(200);
    expect(addStudentToSessionMock).toHaveBeenCalledWith('sess1', 's1');
    expect(removeStudentFromSessionMock).not.toHaveBeenCalled();
  });

  it('swaps out the old session in that period for the new one', async () => {
    getSessionMock.mockResolvedValue({ id: 'sess-new', period_id: 'p1' });
    getStudentScheduleSessionsMock.mockResolvedValue([
      { session_id: 'sess-old', period_id: 'p1' },
    ]);
    const res = await PUT(makeRequest({ period_id: 'p1', session_id: 'sess-new' }), CTX);
    expect(res.status).toBe(200);
    expect(removeStudentFromSessionMock).toHaveBeenCalledWith('sess-old', 's1');
    expect(addStudentToSessionMock).toHaveBeenCalledWith('sess-new', 's1');
  });

  it('clears the period (unassign) when session_id is null', async () => {
    getStudentScheduleSessionsMock.mockResolvedValue([
      { session_id: 'sess-old', period_id: 'p1' },
    ]);
    const res = await PUT(makeRequest({ period_id: 'p1', session_id: null }), CTX);
    expect(res.status).toBe(200);
    expect(removeStudentFromSessionMock).toHaveBeenCalledWith('sess-old', 's1');
    expect(addStudentToSessionMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('is a no-op when re-selecting the session already assigned to that period', async () => {
    getSessionMock.mockResolvedValue({ id: 'sess1', period_id: 'p1' });
    getStudentScheduleSessionsMock.mockResolvedValue([
      { session_id: 'sess1', period_id: 'p1' },
    ]);
    const res = await PUT(makeRequest({ period_id: 'p1', session_id: 'sess1' }), CTX);
    expect(res.status).toBe(200);
    expect(removeStudentFromSessionMock).not.toHaveBeenCalled();
    expect(addStudentToSessionMock).not.toHaveBeenCalled();
  });

  it('only touches enrollment in the targeted period, leaving other periods alone', async () => {
    getSessionMock.mockResolvedValue({ id: 'sess-new', period_id: 'p1' });
    getStudentScheduleSessionsMock.mockResolvedValue([
      { session_id: 'sess-old', period_id: 'p1' },
      { session_id: 'other-period-sess', period_id: 'p2' },
    ]);
    await PUT(makeRequest({ period_id: 'p1', session_id: 'sess-new' }), CTX);
    expect(removeStudentFromSessionMock).not.toHaveBeenCalledWith('other-period-sess', 's1');
  });
});
