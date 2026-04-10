import { describe, it, expect } from 'vitest';
import {
  getTodayDate,
  getCurrentTimeHHMM,
  dayKeyToDate,
  dateToDayKey,
  isDateInCamp,
  formatDayLabel,
  deriveDayDates,
} from '@/lib/date';

const CAMP_WEEK = {
  M: '2026-06-08',
  T: '2026-06-09',
  W: '2026-06-10',
  Th: '2026-06-11',
  F: '2026-06-12',
  S: '2026-06-13',
};

describe('getTodayDate', () => {
  it('returns YYYY-MM-DD in America/Chicago timezone', () => {
    const utcEvening = new Date('2026-06-08T03:00:00Z');
    expect(getTodayDate(utcEvening)).toBe('2026-06-07');
  });

  it('rolls to next day at midnight Central', () => {
    const justPastMidnightCentral = new Date('2026-06-08T06:00:00Z');
    expect(getTodayDate(justPastMidnightCentral)).toBe('2026-06-08');
  });

  it('handles standard time correctly', () => {
    const winterEvening = new Date('2026-01-15T05:00:00Z');
    expect(getTodayDate(winterEvening)).toBe('2026-01-14');
  });

  it('defaults to new Date() when no arg', () => {
    expect(getTodayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getCurrentTimeHHMM', () => {
  it('returns HH:MM in America/Chicago timezone', () => {
    // 2026-06-08T15:30:00Z is 10:30 CDT (UTC-5)
    const utcAfternoon = new Date('2026-06-08T15:30:00Z');
    expect(getCurrentTimeHHMM(utcAfternoon)).toBe('10:30');
  });
});

describe('dayKeyToDate', () => {
  it('returns ISO date for a valid key', () => {
    expect(dayKeyToDate('W', CAMP_WEEK)).toBe('2026-06-10');
  });

  it('returns null for unknown key', () => {
    expect(dayKeyToDate('Z', CAMP_WEEK)).toBeNull();
  });
});

describe('dateToDayKey', () => {
  it('inverts dayKeyToDate', () => {
    expect(dateToDayKey('2026-06-10', CAMP_WEEK)).toBe('W');
  });

  it('returns null when date is outside camp', () => {
    expect(dateToDayKey('2026-05-01', CAMP_WEEK)).toBeNull();
  });
});

describe('isDateInCamp', () => {
  it('true for a camp day', () => {
    expect(isDateInCamp('2026-06-10', CAMP_WEEK)).toBe(true);
  });
  it('false for a non-camp day', () => {
    expect(isDateInCamp('2026-07-01', CAMP_WEEK)).toBe(false);
  });
});

describe('formatDayLabel', () => {
  it('returns short weekday', () => {
    expect(formatDayLabel('M')).toBe('Mon');
    expect(formatDayLabel('Th')).toBe('Thu');
  });
  it('falls back to input for unknown key', () => {
    expect(formatDayLabel('X')).toBe('X');
  });
});

describe('deriveDayDates', () => {
  it('produces sequential day_dates for a 6-day camp', () => {
    expect(deriveDayDates('2026-06-08', '2026-06-13')).toEqual(CAMP_WEEK);
  });

  it('stops at endDate when camp is shorter than 6 days', () => {
    expect(deriveDayDates('2026-06-08', '2026-06-10')).toEqual({
      M: '2026-06-08',
      T: '2026-06-09',
      W: '2026-06-10',
    });
  });

  it('returns empty when start > end', () => {
    expect(deriveDayDates('2026-06-13', '2026-06-08')).toEqual({});
  });

  it('returns empty when given garbage', () => {
    expect(deriveDayDates('not-a-date', '2026-06-13')).toEqual({});
  });
});
