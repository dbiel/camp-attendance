import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { markAttendanceMock } = vi.hoisted(() => ({
  markAttendanceMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  markAttendance: markAttendanceMock,
  getSessionAttendance: vi.fn().mockResolvedValue([]),
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
  });

  it('rejects invalid status', async () => {
    const res = await POST(
      post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'hacked' })
    );
    expect(res.status).toBe(400);
    expect(markAttendanceMock).not.toHaveBeenCalled();
  });

  it('accepts present/absent/tardy', async () => {
    for (const status of ['present', 'absent', 'tardy']) {
      const res = await POST(
        post({ student_id: 's1', session_id: 'sess1', date: '2026-06-08', status })
      );
      expect(res.status).toBe(200);
    }
    expect(markAttendanceMock).toHaveBeenCalledTimes(3);
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
});
