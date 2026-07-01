import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getStudentMock,
  updateStudentMock,
  getStudentScheduleSessionsMock,
  getSessionsMock,
  addStudentToSessionMock,
  removeStudentFromSessionMock,
  verifyIdTokenMock,
} = vi.hoisted(() => ({
  getStudentMock: vi.fn(),
  updateStudentMock: vi.fn(),
  getStudentScheduleSessionsMock: vi.fn(),
  getSessionsMock: vi.fn(),
  addStudentToSessionMock: vi.fn(),
  removeStudentFromSessionMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  getStudent: getStudentMock,
  updateStudent: updateStudentMock,
  deleteStudent: vi.fn(),
  getStudentScheduleForDate: vi.fn(),
  getStudentScheduleSessions: getStudentScheduleSessionsMock,
  getSessions: getSessionsMock,
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

import { PUT } from '@/app/api/students/[id]/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function makeRequest(body: unknown) {
  return new NextRequest(new URL('http://localhost/api/students/s1'), {
    method: 'PUT',
    headers: new Headers({ Authorization: 'Bearer fake', 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

const CTX = { params: { id: 's1' } };

describe('PUT /api/students/[id]', () => {
  beforeEach(() => {
    getStudentMock.mockReset();
    updateStudentMock.mockReset().mockResolvedValue(undefined);
    getStudentScheduleSessionsMock.mockReset().mockResolvedValue([]);
    getSessionsMock.mockReset().mockResolvedValue([]);
    addStudentToSessionMock.mockReset().mockResolvedValue(undefined);
    removeStudentFromSessionMock.mockReset().mockResolvedValue(undefined);
    verifyIdTokenMock.mockReset().mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
  });

  it('updates the student without touching enrollment when ensemble is unchanged', async () => {
    const res = await PUT(makeRequest({ dorm_room: '204' }), CTX);
    expect(res.status).toBe(200);
    expect(getStudentMock).not.toHaveBeenCalled();
    expect(getStudentScheduleSessionsMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it('swaps rehearsal enrollment when ensemble changes', async () => {
    getStudentMock.mockResolvedValue({ id: 's1', ensemble: 'Symphonic Band' });
    getStudentScheduleSessionsMock.mockResolvedValue([
      { session_id: 'old-rehearsal', type: 'rehearsal', ensemble: 'Symphonic Band', period_id: 'p1' },
      { session_id: 'elective-1', type: 'elective', ensemble: null, period_id: 'p2' },
    ]);
    getSessionsMock.mockResolvedValue([
      { id: 'old-rehearsal', type: 'rehearsal', ensemble: 'Symphonic Band', period_id: 'p1' },
      { id: 'new-rehearsal', type: 'rehearsal', ensemble: 'Wind Ensemble', period_id: 'p1' },
    ]);

    const res = await PUT(makeRequest({ ensemble: 'Wind Ensemble' }), CTX);
    expect(res.status).toBe(200);
    expect(removeStudentFromSessionMock).toHaveBeenCalledWith('old-rehearsal', 's1');
    expect(removeStudentFromSessionMock).not.toHaveBeenCalledWith('elective-1', 's1');
    expect(addStudentToSessionMock).toHaveBeenCalledWith('new-rehearsal', 's1');
    const body = await res.json();
    expect(body.schedule_sync).toEqual({ removed: 1, added: 1 });
  });

  it('reports removed-but-not-added when no rehearsal session matches the new ensemble', async () => {
    getStudentMock.mockResolvedValue({ id: 's1', ensemble: 'Symphonic Band' });
    getStudentScheduleSessionsMock.mockResolvedValue([
      { session_id: 'old-rehearsal', type: 'rehearsal', ensemble: 'Symphonic Band', period_id: 'p1' },
    ]);
    getSessionsMock.mockResolvedValue([
      { id: 'old-rehearsal', type: 'rehearsal', ensemble: 'Symphonic Band', period_id: 'p1' },
    ]);

    const res = await PUT(makeRequest({ ensemble: 'Nonexistent Ensemble' }), CTX);
    const body = await res.json();
    expect(body.schedule_sync).toEqual({ removed: 1, added: 0 });
    expect(addStudentToSessionMock).not.toHaveBeenCalled();
  });

  it('does not sync when ensemble is present but unchanged from the current value', async () => {
    getStudentMock.mockResolvedValue({ id: 's1', ensemble: 'Symphonic Band' });
    const res = await PUT(makeRequest({ ensemble: 'Symphonic Band' }), CTX);
    expect(res.status).toBe(200);
    expect(getStudentScheduleSessionsMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.schedule_sync).toBeUndefined();
  });
});
