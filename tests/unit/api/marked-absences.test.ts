import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ created: 'm1', list: [] as unknown[], cleared: [] as string[] }));

vi.mock('@/lib/with-auth', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}));
vi.mock('@/lib/auth', () => ({ verifyAdmin: async () => ({ email: 'd@x' }) }));
vi.mock('@/lib/date', () => ({ getTodayDate: () => '2026-06-29' }));
vi.mock('@/lib/marked-absences', () => ({
  validateWindow: (f: string, u: string) => /^\d{1,2}:\d{2}$/.test(f) && /^\d{1,2}:\d{2}$/.test(u) && f < u,
  createMarkedAbsence: async () => h.created,
  listMarkedAbsences: async () => h.list,
  clearMarkedAbsence: async (id: string) => { h.cleared.push(id); },
}));

import { POST, GET } from '@/app/api/marked-absences/route';
import { DELETE } from '@/app/api/marked-absences/[id]/route';

const req = (body?: unknown, url = 'http://x/api/marked-absences') =>
  new Request(url, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined }) as any;

beforeEach(() => { h.list = []; h.cleared = []; });

describe('POST /api/marked-absences', () => {
  it('creates and returns the id', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe('m1');
  });
  it('400 on a bad window', async () => {
    const res = await POST(req({ student_id: 's1', student_name: 'Jane', from: '14:30', until: '13:00' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
  it('400 on a missing student', async () => {
    const res = await POST(req({ student_name: 'Jane', from: '13:00', until: '14:30' }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/marked-absences', () => {
  it('returns todays absences', async () => {
    h.list = [{ id: 'm1' }];
    const res = await GET(req(undefined, 'http://x/api/marked-absences'), { params: {} } as any);
    expect((await res.json()).absences).toEqual([{ id: 'm1' }]);
  });
});

describe('DELETE /api/marked-absences/[id]', () => {
  it('clears the absence', async () => {
    const res = await DELETE(req(undefined) as any, { params: { id: 'm9' } } as any);
    expect(res.status).toBe(200);
    expect(h.cleared).toEqual(['m9']);
  });
});
