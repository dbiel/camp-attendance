import { describe, it, expect } from 'vitest';
import { validateWindow, isCovering, filterCoveringForStudents } from '@/lib/marked-absences';

const a = (over: Partial<{ status: string; date: string; from: string; until: string; student_id: string; id: string }>) => ({
  id: over.id ?? 'x', student_id: over.student_id ?? 's1', student_name: 'Jane Doe',
  date: over.date ?? '2026-06-29', from: over.from ?? '13:00', until: over.until ?? '14:30',
  all_day: false,
  note: null, status: (over.status ?? 'active') as 'active' | 'cleared',
  cleared_at: null, cleared_reason: null, created_by: 'd', created_at: 'iso',
});

describe('validateWindow', () => {
  it('accepts a valid HH:MM window with from < until', () => {
    expect(validateWindow('13:00', '14:30')).toBe(true);
  });
  it('rejects from >= until and bad formats', () => {
    expect(validateWindow('14:30', '13:00')).toBe(false);
    expect(validateWindow('13:00', '13:00')).toBe(false);
    expect(validateWindow('1300', '14:30')).toBe(false);
    expect(validateWindow('', '14:30')).toBe(false);
  });
  it('rejects single-digit (non-zero-padded) hours', () => {
    expect(validateWindow('9:00', '10:00')).toBe(false);
    expect(validateWindow('09:00', '10:00')).toBe(true);
  });
});

describe('isCovering', () => {
  const date = '2026-06-29';
  it('true inside the window', () => expect(isCovering(a({}), '13:30', date)).toBe(true));
  it('true exactly at from (inclusive)', () => expect(isCovering(a({}), '13:00', date)).toBe(true));
  it('false exactly at until (exclusive)', () => expect(isCovering(a({}), '14:30', date)).toBe(false));
  it('false before from', () => expect(isCovering(a({}), '12:59', date)).toBe(false));
  it('false on a different date', () => expect(isCovering(a({}), '13:30', '2026-06-30')).toBe(false));
  it('false when cleared', () => expect(isCovering(a({ status: 'cleared' }), '13:30', date)).toBe(false));
});

describe('filterCoveringForStudents', () => {
  it('keeps only roster students whose absence covers now', () => {
    const list = [a({ id: 'm1', student_id: 's1' }), a({ id: 'm2', student_id: 's2', from: '09:00', until: '10:00' }), a({ id: 'm3', student_id: 'other' })];
    const map = filterCoveringForStudents(list, ['s1', 's2'], '13:30', '2026-06-29');
    expect([...map.keys()]).toEqual(['s1']); // s2 not covering now, other not in roster
    expect(map.get('s1')?.id).toBe('m1');
  });
});

import { validDate, resolveWindow, filterUpcoming } from '@/lib/marked-absences';

describe('validDate', () => {
  it('accepts today and future YYYY-MM-DD', () => {
    expect(validDate('2026-06-29', '2026-06-29')).toBe(true);
    expect(validDate('2026-07-01', '2026-06-29')).toBe(true);
  });
  it('rejects past dates and malformed strings', () => {
    expect(validDate('2026-06-28', '2026-06-29')).toBe(false);
    expect(validDate('6/29/2026', '2026-06-29')).toBe(false);
    expect(validDate('', '2026-06-29')).toBe(false);
  });
});

describe('resolveWindow', () => {
  it('forces 00:00–23:59 for all-day', () => {
    expect(resolveWindow(true, '13:00', '14:00')).toEqual({ from: '00:00', until: '23:59' });
  });
  it('keeps the given window when not all-day', () => {
    expect(resolveWindow(false, '13:00', '14:00')).toEqual({ from: '13:00', until: '14:00' });
  });
});

describe('filterUpcoming', () => {
  const mk = (id: string, date: string, from: string) => ({
    id, student_id: 's', student_name: 'n', date, from, until: '23:59', all_day: false,
    note: null, status: 'active', cleared_at: null, cleared_reason: null, created_by: 'd', created_at: 'iso',
  }) as any;
  it('keeps today+future, drops past, sorts by date then from', () => {
    const list = [mk('c', '2026-07-02', '09:00'), mk('a', '2026-06-29', '13:00'), mk('b', '2026-06-29', '08:00'), mk('p', '2026-06-28', '09:00')];
    const out = filterUpcoming(list, '2026-06-29');
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
