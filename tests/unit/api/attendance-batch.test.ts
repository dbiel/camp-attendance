import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { markAttendanceBatchMock } = vi.hoisted(() => ({
  markAttendanceBatchMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  markAttendanceBatch: markAttendanceBatchMock,
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

import { POST } from '@/app/api/attendance/batch/route';

const CTX = { params: {} };

function post(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/attendance/batch', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  });
}

function noAuthPost(body: unknown) {
  return new NextRequest('http://localhost/api/attendance/batch', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

function call(req: NextRequest) {
  return POST(req, CTX);
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    student_id: 's1',
    session_id: 'sess1',
    date: '2026-06-08',
    status: 'present',
    ...overrides,
  };
}

describe('POST /api/attendance/batch', () => {
  beforeEach(() => {
    markAttendanceBatchMock.mockReset();
    markAttendanceBatchMock.mockResolvedValue({ written: 0, skipped: 0, errors: [] });
  });

  it('returns 401 when no auth', async () => {
    const res = await call(noAuthPost({ items: [makeItem()] }));
    expect(res.status).toBe(401);
    expect(markAttendanceBatchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on missing items field', async () => {
    const res = await call(post({}));
    expect(res.status).toBe(400);
    expect(markAttendanceBatchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on empty items array', async () => {
    const res = await call(post({ items: [] }));
    expect(res.status).toBe(400);
    expect(markAttendanceBatchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid status with index in error', async () => {
    const items = [makeItem(), makeItem({ status: 'excused' }), makeItem()];
    const res = await call(post({ items }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain('1');
    expect(markAttendanceBatchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on missing required field', async () => {
    const items = [makeItem({ student_id: undefined })];
    const res = await call(post({ items }));
    expect(res.status).toBe(400);
    expect(markAttendanceBatchMock).not.toHaveBeenCalled();
  });

  it('returns 413 when items.length > 1000', async () => {
    const items = Array.from({ length: 1001 }, () => makeItem());
    const res = await call(post({ items }));
    expect(res.status).toBe(413);
    expect(markAttendanceBatchMock).not.toHaveBeenCalled();
  });

  it('returns 200 on happy path and forwards items + server-derived markedBy', async () => {
    markAttendanceBatchMock.mockResolvedValue({ written: 2, skipped: 0, errors: [] });
    const items = [makeItem(), makeItem({ student_id: 's2', status: 'absent' })];
    const res = await call(post({ items }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.written).toBe(2);
    expect(body.skipped).toBe(0);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(markAttendanceBatchMock).toHaveBeenCalledTimes(1);
    const mockCall = markAttendanceBatchMock.mock.calls[0]!;
    expect(mockCall[0]).toHaveLength(2);
    // Second arg is server-derived markedBy; must not reflect any client value.
    expect(typeof mockCall[1]).toBe('string');
    expect(mockCall[1]).not.toBe('SPOOFED');
  });

  it('ignores client-supplied marked_by top-level field', async () => {
    markAttendanceBatchMock.mockResolvedValue({ written: 1, skipped: 0, errors: [] });
    const items = [makeItem()];
    await call(post({ items, marked_by: 'SPOOFED' }));
    const mockCall = markAttendanceBatchMock.mock.calls[0]!;
    expect(mockCall[1]).not.toBe('SPOOFED');
  });

  it('accepts all three valid statuses', async () => {
    markAttendanceBatchMock.mockResolvedValue({ written: 3, skipped: 0, errors: [] });
    const items = [
      makeItem({ status: 'present' }),
      makeItem({ status: 'absent' }),
      makeItem({ status: 'tardy' }),
    ];
    const res = await call(post({ items }));
    expect(res.status).toBe(200);
  });
});
