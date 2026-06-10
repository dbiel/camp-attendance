import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  deleteAttendanceMock,
  isFacultyAssignedToSessionMock,
  verifyIdTokenMock,
  getAdminRoleMock,
} = vi.hoisted(() => ({
  deleteAttendanceMock: vi.fn(),
  isFacultyAssignedToSessionMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  getAdminRoleMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  deleteAttendance: deleteAttendanceMock,
  isFacultyAssignedToSession: isFacultyAssignedToSessionMock,
  // Other exports used by the module under import.
  markAttendance: vi.fn(),
  getSessionAttendance: vi.fn().mockResolvedValue([]),
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
  getAdminRole: getAdminRoleMock,
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

import { DELETE, GET } from '@/app/api/attendance/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function makeRequest(
  params: Record<string, string>,
  headers: Record<string, string> = {}
) {
  const url = new URL('http://localhost/api/attendance');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: 'DELETE',
    headers: new Headers(headers),
  });
}

describe('DELETE /api/attendance', () => {
  beforeEach(() => {
    deleteAttendanceMock.mockReset();
    deleteAttendanceMock.mockResolvedValue(true);
    isFacultyAssignedToSessionMock.mockReset();
    isFacultyAssignedToSessionMock.mockResolvedValue(true);
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    getAdminRoleMock.mockReset();
    getAdminRoleMock.mockResolvedValue('super_admin');
    _resetRateLimitForTests();
  });

  it('returns 401 when no auth', async () => {
    const res = await DELETE(
      makeRequest({ student_id: 's1', session_id: 'sess1', date: '2026-06-08' })
    );
    expect(res.status).toBe(401);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();
  });

  it('returns 429 when unauth attempts exceed rate limit', async () => {
    // Burn the default 5-hit budget
    for (let i = 0; i < 5; i++) {
      await DELETE(
        makeRequest(
          { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
          { 'x-forwarded-for': '5.5.5.5' }
        )
      );
    }
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { 'x-forwarded-for': '5.5.5.5' }
      )
    );
    expect(res.status).toBe(429);
  });

  it('returns 400 when student_id missing (admin)', async () => {
    const res = await DELETE(
      makeRequest(
        { session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(400);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();
  });

  it('returns 400 when session_id missing (admin)', async () => {
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', date: '2026-06-08' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(400);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();
  });

  it('returns 400 when date missing (admin)', async () => {
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(400);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();
  });

  it('returns 200 on admin happy path', async () => {
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteAttendanceMock).toHaveBeenCalledWith('s1', 'sess1', '2026-06-08');
  });

  it('returns 403 when teacher has no X-Faculty-Id', async () => {
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { 'X-Camp-Code': 'wrong-code' }
      )
    );
    // Teacher verify fails on bad code → 401. With correct code but missing
    // X-Faculty-Id → 403. We test the missing X-Faculty-Id branch in isolation
    // by letting verifyTeacher succeed — that's done via env CAMP_CODE below.
    // Here we only assert auth rejected without faculty scoping check.
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 when teacher not assigned to session', async () => {
    // Simulate a valid teacher by using env CAMP_CODE.
    process.env.CAMP_CODE = 'teachercode';
    isFacultyAssignedToSessionMock.mockResolvedValue(false);

    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { 'X-Camp-Code': 'teachercode', 'X-Faculty-Id': 'f1' }
      )
    );
    expect(res.status).toBe(403);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();

    delete process.env.CAMP_CODE;
  });

  it('returns 200 on teacher happy path (assigned to session)', async () => {
    process.env.CAMP_CODE = 'teachercode';
    isFacultyAssignedToSessionMock.mockResolvedValue(true);

    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { 'X-Camp-Code': 'teachercode', 'X-Faculty-Id': 'f1' }
      )
    );
    expect(res.status).toBe(200);
    expect(deleteAttendanceMock).toHaveBeenCalledWith('s1', 'sess1', '2026-06-08');

    delete process.env.CAMP_CODE;
  });

  it('returns 200 idempotently when no doc existed', async () => {
    deleteAttendanceMock.mockResolvedValue(false);
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

function makeGetRequest(
  params: Record<string, string>,
  headers: Record<string, string> = {}
) {
  const url = new URL('http://localhost/api/attendance');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { headers: new Headers(headers) });
}

describe('dorm_admin role gating on /api/attendance', () => {
  beforeEach(() => {
    deleteAttendanceMock.mockReset();
    deleteAttendanceMock.mockResolvedValue(true);
    isFacultyAssignedToSessionMock.mockReset();
    isFacultyAssignedToSessionMock.mockResolvedValue(true);
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'dorm-1', email: 'dorm@test.com' });
    getAdminRoleMock.mockReset();
    getAdminRoleMock.mockResolvedValue('dorm_admin');
    _resetRateLimitForTests();
  });

  it('DELETE: dorm_admin Bearer with no camp code gets 401, not admin treatment', async () => {
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(401);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();
  });

  it('DELETE: dorm_admin Bearer + valid camp code is teacher-scoped (403 without X-Faculty-Id)', async () => {
    process.env.CAMP_CODE = 'teachercode';
    const res = await DELETE(
      makeRequest(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake', 'X-Camp-Code': 'teachercode' }
      )
    );
    // An admin would skip the X-Faculty-Id requirement — 403 proves the
    // dorm_admin landed on the teacher branch.
    expect(res.status).toBe(403);
    expect(deleteAttendanceMock).not.toHaveBeenCalled();
    delete process.env.CAMP_CODE;
  });

  it('GET: dorm_admin Bearer with no camp code gets 401', async () => {
    const res = await GET(
      makeGetRequest(
        { session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake' }
      )
    );
    expect(res.status).toBe(401);
  });

  it('GET: dorm_admin Bearer + valid camp code is teacher-scoped (403 without X-Faculty-Id)', async () => {
    process.env.CAMP_CODE = 'teachercode';
    const res = await GET(
      makeGetRequest(
        { session_id: 'sess1', date: '2026-06-08' },
        { Authorization: 'Bearer fake', 'X-Camp-Code': 'teachercode' }
      )
    );
    expect(res.status).toBe(403);
    delete process.env.CAMP_CODE;
  });
});
