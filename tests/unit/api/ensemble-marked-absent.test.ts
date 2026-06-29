import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  ctx: { status: 'rehearsal', forced: false, period_number: 6, period_name: 'Period 6', start_time: '13:00', end_time: '14:00', location: 'Hemmle', next: null, ensemble: 'Band 5', label: null, slot_key: 'P6' },
  roster: [{ id: 's1', preferred_name: '', first_name: 'Jane', last_name: 'Doe', instrument: 'Flute', grade: '9' }, { id: 's2', preferred_name: '', first_name: 'Sam', last_name: 'Poe', instrument: 'Flute', grade: '9' }],
  marked: new Map<string, any>(),
  rl: true,
}));

vi.mock('@/lib/ensemble-attendance', () => ({
  getCurrentEnsembleSession: async () => h.ctx,
  getRosterForToken: async () => ({ ensemble: 'Band 5', label: null, roster: h.roster }),
  getEnsembleSubmission: async () => null,
}));
vi.mock('@/lib/ensemble-incidents', () => ({ listTodayReportRefs: async () => [] }));
vi.mock('@/lib/marked-absences', () => ({ activeMarkedAbsencesForStudents: async () => h.marked }));
vi.mock('@/lib/date', () => ({ getTodayDate: () => '2026-06-29', getCurrentTimeHHMM: () => '13:30' }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => h.rl, getClientIp: () => '1.2.3.4' }));

import { GET } from '@/app/api/e/[token]/route';

const req = (url = 'http://x/api/e/t') => new Request(url) as any;

beforeEach(() => { h.marked = new Map(); h.rl = true; });

describe('GET /api/e/[token] marked_absent', () => {
  it('returns a ref-keyed marked_absent map (no student_id)', async () => {
    h.marked = new Map([['s1', { id: 'm1', note: 'doctor appt', until: '14:30', from: '13:00', status: 'active', date: '2026-06-29', student_id: 's1', student_name: 'Jane Doe' }]]);
    const res = await GET(req(), { params: { token: 't' } });
    const body = await res.json();
    expect(body.marked_absent).toEqual({ 0: { note: 'doctor appt', until: '14:30' } });
    expect(JSON.stringify(body.marked_absent)).not.toContain('s1');
  });
  it('omits students with no covering absence', async () => {
    const res = await GET(req(), { params: { token: 't' } });
    expect((await res.json()).marked_absent).toEqual({});
  });
});
