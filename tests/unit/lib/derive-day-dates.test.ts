import { describe, it, expect } from 'vitest';
import { deriveDayDates } from '@/lib/date';

/**
 * Behavior spec for deriveDayDates:
 *  - Inputs are ISO YYYY-MM-DD strings, parsed as local calendar dates
 *    (not UTC) so the day-of-week stays stable across timezones.
 *  - Keys come from the actual weekday of each date (not a fixed
 *    position), using M, T, W, Th, F, S, Su.
 *  - For camps that span >7 days the same key is visited more than once;
 *    later occurrences overwrite earlier ones.
 *  - Throws RangeError on malformed ISO input or when endDate < startDate.
 */
describe('deriveDayDates', () => {
  it('single-day camp on a Monday returns just { M }', () => {
    expect(deriveDayDates('2026-06-08', '2026-06-08')).toEqual({
      M: '2026-06-08',
    });
  });

  it('maps a 6-day Mon-Sat camp to M..S', () => {
    expect(deriveDayDates('2026-06-08', '2026-06-13')).toEqual({
      M: '2026-06-08',
      T: '2026-06-09',
      W: '2026-06-10',
      Th: '2026-06-11',
      F: '2026-06-12',
      S: '2026-06-13',
    });
  });

  it('maps a full Mon-Sun week to all 7 keys including Su', () => {
    expect(deriveDayDates('2026-06-08', '2026-06-14')).toEqual({
      M: '2026-06-08',
      T: '2026-06-09',
      W: '2026-06-10',
      Th: '2026-06-11',
      F: '2026-06-12',
      S: '2026-06-13',
      Su: '2026-06-14',
    });
  });

  it('uses actual weekdays, not positional keys — camp starting on a Wednesday', () => {
    // 2026-06-10 is a Wednesday. Starting mid-week should still assign
    // 'W' to the first day (not 'M').
    expect(deriveDayDates('2026-06-10', '2026-06-12')).toEqual({
      W: '2026-06-10',
      Th: '2026-06-11',
      F: '2026-06-12',
    });
  });

  it('later occurrences win on a 9-day camp spanning two Mondays', () => {
    // 2026-06-08 (Mon) through 2026-06-16 (Tue) = 9 days.
    // First Monday is 2026-06-08, second Monday is 2026-06-15 — the
    // second one should end up under M.
    const out = deriveDayDates('2026-06-08', '2026-06-16');
    expect(out.M).toBe('2026-06-15');
    expect(out.T).toBe('2026-06-16');
    // All day keys are populated by a 9+ day span.
    expect(out.W).toBe('2026-06-10');
    expect(out.Th).toBe('2026-06-11');
    expect(out.F).toBe('2026-06-12');
    expect(out.S).toBe('2026-06-13');
    expect(out.Su).toBe('2026-06-14');
  });

  it('throws on malformed startDate', () => {
    expect(() => deriveDayDates('not-a-date', '2026-06-13')).toThrow(RangeError);
  });

  it('throws on malformed endDate', () => {
    expect(() => deriveDayDates('2026-06-08', '2026-13-45')).toThrow(RangeError);
  });

  it('throws when endDate is before startDate', () => {
    expect(() => deriveDayDates('2026-06-13', '2026-06-08')).toThrow(RangeError);
  });
});
