import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { markAttendanceMock, getAdminRoleMock } = vi.hoisted(() => ({
  markAttendanceMock: vi.fn(),
  getAdminRoleMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  markAttendance: markAttendanceMock,
  getSessionAttendance: vi.fn().mockResolvedValue([]),
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
  getAdminRole: getAdminRoleMock,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' }),
  },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  },
}));

import { POST } from '@/app/api/attendance/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

function post(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/attendance', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/attendance', () => {
  beforeEach(() => {
    markAttendanceMock.mockReset();
    markAttendanceMock.mockResolvedValue(undefined);
    getAdminRoleMock.mockReset();
    getAdminRoleMock.mockResolvedValue('super_admin');
    _resetRateLimitForTests();
  });

  it('rejects invalid status', async () => {
    const res = await POST(
      post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'hacked' })
    );
    expect(res.status).toBe(400);
    expect(markAttendanceMock).not.toHaveBeenCalled();
  });

  it('accepts present and absent', async () => {
    for (const status of ['present', 'absent']) {
      const res = await POST(
        post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status })
      );
      expect(res.status).toBe(200);
    }
    expect(markAttendanceMock).toHaveBeenCalledTimes(2);
  });

  it('rejects tardy (removed status)', async () => {
    const res = await POST(
      post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'tardy' })
    );
    expect(res.status).toBe(400);
    expect(markAttendanceMock).not.toHaveBeenCalled();
  });

  it('ignores client-supplied marked_by and derives from caller identity', async () => {
    await POST(
      post({
        student_id: 's1',
        session_id: 'sess1',
        date: '2026-06-08',
        status: 'present',
        marked_by: 'SPOOFED-UID',
      })
    );
    const call = markAttendanceMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![4]).not.toBe('SPOOFED-UID');
    expect(call![4]).toMatch(/^admin:admin-1$/);
  });

  it('rejects missing required fields', async () => {
    const res = await POST(post({ student_id: 's1', session_id: 'sess1' }));
    expect(res.status).toBe(400);
    expect(markAttendanceMock).not.toHaveBeenCalled();
  });

  it('returns 401 for dorm_admin Bearer token with no camp code (no admin treatment)', async () => {
    getAdminRoleMock.mockResolvedValue('dorm_admin');
    const res = await POST(
      post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'present' })
    );
    expect(res.status).toBe(401);
    expect(markAttendanceMock).not.toHaveBeenCalled();
  });

  it('treats dorm_admin Bearer + valid camp code as teacher, not admin (marked_by)', async () => {
    getAdminRoleMock.mockResolvedValue('dorm_admin');
    process.env.CAMP_CODE = 'teachercode';

    const res = await POST(
      post(
        { student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'present' },
        { Authorization: 'Bearer fake', 'X-Camp-Code': 'teachercode' }
      )
    );
    expect(res.status).toBe(200);
    const call = markAttendanceMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![4]).toMatch(/^teacher:/);
    expect(call![4]).not.toMatch(/^admin:/);

    delete process.env.CAMP_CODE;
  });
});
