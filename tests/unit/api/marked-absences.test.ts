import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ created: 'm1', createArgs: null as any, list: [] as unknown[], upcoming: [] as unknown[], cleared: [] as string[] }));

vi.mock('@/lib/with-auth', () => ({ withAuth: (_role: string, handler: Function) => handler }));
vi.mock('@/lib/auth', () => ({ verifyAdmin: async () => ({ email: 'd@x' }) }));
vi.mock('@/lib/date', () => ({ getTodayDate: () => '2026-06-29' }));
vi.mock('@/lib/marked-absences', () => ({
  validateWindow: (f: string, u: string) => /^\d{2}:\d{2}$/.test(f) && /^\d{2}:\d{2}$/.test(u) && f < u,
  validDate: (d: string, today = '2026-06-29') => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today,
  createMarkedAbsence: async (args: any) => { h.createArgs = args; return h.created; },
  listMarkedAbsences: async () => h.list,
  listUpcomingMarkedAbsences: async () => h.upcoming,
  clearMarkedAbsence: async (id: string) => { h.cleared.push(id); },
}));

import { POST, GET } from '@/app/api/marked-absences/route';

const req = (body?: unknown, url = 'http://x/api/marked-absences') =>
  new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }) as any;

beforeEach(() => { h.createArgs = null; h.list = []; h.upcoming = []; h.cleared = []; });

describe('POST /api/marked-absences', () => {
  it('creates a timed absence with a date', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-07-01', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(200);
    expect(h.createArgs).toMatchObject({ date: '2026-07-01', from: '13:00', until: '14:30', all_day: false });
  });
  it('creates an all-day absence WITHOUT a window', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-06-29', all_day: true }), { params: {} } as any);
    expect(res.status).toBe(200);
    expect(h.createArgs).toMatchObject({ all_day: true, date: '2026-06-29' });
  });
  it('400 on a past date', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-06-28', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
  it('400 on a timed absence with a bad window', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', date: '2026-06-29', from: '14:30', until: '13:00' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
  it('400 on a missing student', async () => {
    const res = await POST(req({ student_name: 'Jane', date: '2026-06-29', all_day: true }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/marked-absences', () => {
  it('returns upcoming when no ?date', async () => {
    h.upcoming = [{ id: 'm1' }];
    const res = await GET(req(undefined, 'http://x/api/marked-absences'), { params: {} } as any);
    expect((await res.json()).absences).toEqual([{ id: 'm1' }]);
  });
  it('returns a specific day when ?date is given', async () => {
    h.list = [{ id: 'd1' }];
    const res = await GET(req(undefined, 'http://x/api/marked-absences?date=2026-07-01'), { params: {} } as any);
    expect((await res.json()).absences).toEqual([{ id: 'd1' }]);
  });
});
