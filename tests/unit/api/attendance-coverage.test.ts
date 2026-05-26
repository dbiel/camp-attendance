import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: (_role: string, handler: any) => handler,
}));
vi.mock('@/lib/firestore', () => ({
  getDayCoverage: vi.fn(async (_date: string) => [
    {
      session_id: 's1',
      session_name: 'Brass Sectional',
      period_id: 'p1',
      period_number: 1,
      period_name: 'Period 1',
      start_time: '8:00',
      end_time: '8:50',
      ensemble: 'Band 1',
      instrument: 'Trumpet',
      faculty_id: 'f1',
      teacher_name: 'John Smith',
      total_students: 3,
      marked_count: 2,
      absent_count: 1,
    },
  ]),
}));

import { GET } from '@/app/api/attendance/coverage/route';

describe('GET /api/attendance/coverage', () => {
  it('400 when date param missing', async () => {
    const req = new NextRequest('http://localhost/api/attendance/coverage');
    const res = await GET(req, { params: {}, role: 'admin' } as any);
    expect(res.status).toBe(400);
  });

  it('returns coverage rows for the date', async () => {
    const req = new NextRequest('http://localhost/api/attendance/coverage?date=2026-06-08');
    const res = await GET(req, { params: {}, role: 'admin' } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      session_id: 's1',
      total_students: 3,
      marked_count: 2,
      absent_count: 1,
    });
  });
});
