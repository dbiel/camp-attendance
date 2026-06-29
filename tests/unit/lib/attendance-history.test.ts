import { describe, it, expect } from 'vitest';
import { buildAttendanceHistory, type BuildArgs } from '@/lib/attendance-history';
import type { Period } from '@/lib/types';

const periods: Period[] = [
  { id: '1', number: 1, name: 'Period 1', start_time: '08:00', end_time: '08:50' },
  { id: '2', number: 2, name: 'Period 2', start_time: '09:00', end_time: '09:50' },
  { id: '3', number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' },
];
const ensembles = ['Band 1', 'Band 2'] as const;
const base = (over: Partial<BuildArgs> = {}): BuildArgs => ({
  day: '2026-06-29',
  today: '2026-06-29',
  nowHHMM: '11:00',
  periods,
  rehearsalSessions: [
    { ensemble: 'Band 1', period_number: 1 },
    { ensemble: 'Band 1', period_number: 3 },
    { ensemble: 'Band 2', period_number: 2 },
  ],
  submissions: [
    {
      ensemble: 'Band 1',
      day_key: '2026-06-29',
      period_number: 1,
      period_name: 'Period 1',
      marks: { a: 'present', b: 'absent', c: 'absent' },
      roster_size: 3,
      submitted_at: '2026-06-29T13:05:00.000Z',
    },
    {
      ensemble: 'Band 2',
      day_key: '2026-06-29',
      period_number: 2,
      period_name: 'Period 2',
      marks: { a: 'present' },
      roster_size: 1,
      submitted_at: '2026-06-29T14:02:00.000Z',
    },
  ],
  allDayKeys: ['2026-06-29'],
  ensembles,
  ...over,
});

describe('buildAttendanceHistory', () => {
  it('emits only past periods ascending (today, now=11:00 → P1,P2,P3 all past)', () => {
    const r = buildAttendanceHistory(base());
    expect(r.periods.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('hides future periods today (now=09:30 → only P1 past)', () => {
    const r = buildAttendanceHistory(base({ nowHHMM: '09:30' }));
    expect(r.periods.map((p) => p.number)).toEqual([1]);
  });

  it('earlier day → all periods past regardless of now', () => {
    const r = buildAttendanceHistory(
      base({ day: '2026-06-28', nowHHMM: '00:00', allDayKeys: ['2026-06-28', '2026-06-29'] })
    );
    expect(r.periods.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it('cell = taken with absent_count for a submitted ensemble+period', () => {
    const r = buildAttendanceHistory(base());
    expect(r.cells['Band 1'][1]).toEqual({
      state: 'taken',
      submitted_at: '2026-06-29T13:05:00.000Z',
      absent_count: 2,
      roster_size: 3,
    });
  });

  it('cell = missed when a rehearsal is scheduled but no submission', () => {
    const r = buildAttendanceHistory(base());
    expect(r.cells['Band 1'][3]).toEqual({ state: 'missed' });
  });

  it('cell = none when no rehearsal scheduled that period', () => {
    const r = buildAttendanceHistory(base());
    expect(r.cells['Band 1'][2]).toEqual({ state: 'none' });
  });

  it('list is newest-first and flags in_grid / scheduled', () => {
    const r = buildAttendanceHistory(base());
    expect(r.list.map((x) => x.ensemble)).toEqual(['Band 2', 'Band 1']); // 14:02 before 13:05
    expect(r.list[1]).toMatchObject({ ensemble: 'Band 1', in_grid: true, scheduled: true, absent_count: 2 });
  });

  it('force-opened / non-standard submission → in_grid:false but still in list', () => {
    const r = buildAttendanceHistory(
      base({
        submissions: [
          {
            ensemble: 'Jazz 1',
            day_key: '2026-06-29',
            period_number: 12,
            period_name: '12:00–13:00',
            marks: { a: 'absent' },
            roster_size: 1,
            submitted_at: '2026-06-29T17:00:00.000Z',
          },
        ],
      })
    );
    expect(r.list).toHaveLength(1);
    expect(r.list[0]).toMatchObject({ ensemble: 'Jazz 1', in_grid: false });
    expect(r.cells['Band 1']).toBeDefined(); // grid unaffected
  });

  it('numeric (not lexicographic) time compare handles unpadded now', () => {
    // now=9:30 → P1 (ends 08:50) past; P2 (09:50) and P3 (10:50) not yet.
    const r = buildAttendanceHistory(base({ nowHHMM: '9:30' }));
    expect(r.periods.map((p) => p.number)).toEqual([1]);
  });

  it('forced submission does NOT occupy a real grid cell with the same period_number', () => {
    const r = buildAttendanceHistory(
      base({
        submissions: [
          // genuine scheduled submission for Band 1, period 1
          {
            ensemble: 'Band 1',
            day_key: '2026-06-29',
            period_number: 1,
            period_name: 'Period 1',
            marks: { a: 'present', b: 'absent' },
            roster_size: 2,
            submitted_at: '2026-06-29T13:05:00.000Z',
          },
          // force-opened submission that happens to carry period_number 1 (clock hour)
          {
            ensemble: 'Band 1',
            day_key: '2026-06-29',
            period_number: 1,
            period_name: 'Forced attendance',
            marks: { a: 'absent', b: 'absent' },
            roster_size: 2,
            submitted_at: '2026-06-29T15:30:00.000Z',
            forced: true,
          },
        ],
      })
    );
    // grid cell reflects the genuine submission (1 absent), not the forced one (2 absent)
    expect(r.cells['Band 1'][1]).toEqual({
      state: 'taken',
      submitted_at: '2026-06-29T13:05:00.000Z',
      absent_count: 1,
      roster_size: 2,
    });
    // both appear in the list; forced flagged, in_grid false, newest first
    expect(r.list).toHaveLength(2);
    expect(r.list[0]).toMatchObject({ forced: true, in_grid: false, scheduled: false });
    expect(r.list[1]).toMatchObject({ forced: false, in_grid: true });
  });

  it('availableDays = distinct day_keys ∪ today, newest first', () => {
    const r = buildAttendanceHistory(base({ allDayKeys: ['2026-06-27', '2026-06-28'] }));
    expect(r.availableDays).toEqual(['2026-06-29', '2026-06-28', '2026-06-27']);
  });

  it('empty inputs → empty grid, no throw', () => {
    const r = buildAttendanceHistory(
      base({ periods: [], submissions: [], rehearsalSessions: [], allDayKeys: [] })
    );
    expect(r.periods).toEqual([]);
    expect(r.list).toEqual([]);
    expect(r.availableDays).toEqual(['2026-06-29']);
  });
});
