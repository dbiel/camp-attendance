import { describe, it, expect } from 'vitest';
import {
  getTodayDate,
  getCurrentTimeHHMM,
  dayKeyToDate,
  dateToDayKey,
  isDateInCamp,
  formatDayLabel,
  periodInstant,
  hourBucket,
  formatClock,
} from '@/lib/date';

// deriveDayDates has a dedicated spec in ./derive-day-dates.test.ts

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

const DAY_DATES = { M: '2026-06-08', T: '2026-06-09' }; // summer → CDT (UTC-5)

describe('periodInstant', () => {
  it('combines a camp day + period start into a UTC instant (CDT, UTC-5)', () => {
    expect(periodInstant('M', '08:00', DAY_DATES)).toBe('2026-06-08T13:00:00.000Z');
    expect(periodInstant('M', '10:00', DAY_DATES)).toBe('2026-06-08T15:00:00.000Z');
    expect(periodInstant('T', '13:30', DAY_DATES)).toBe('2026-06-09T18:30:00.000Z');
  });

  it('is DST-aware — a winter date resolves at CST (UTC-6)', () => {
    expect(periodInstant('W', '08:00', { W: '2026-01-15' })).toBe('2026-01-15T14:00:00.000Z');
  });

  it('returns null for an unmapped day key or malformed time', () => {
    expect(periodInstant('Z', '08:00', DAY_DATES)).toBeNull();
    expect(periodInstant('M', 'noon', DAY_DATES)).toBeNull();
    expect(periodInstant('M', '25:00', DAY_DATES)).toBeNull();
  });
});

describe('hourBucket', () => {
  it('buckets by camp-tz calendar hour, not UTC', () => {
    expect(hourBucket('2026-06-08T13:00:00.000Z')).toBe('2026-06-08 08');
    // 04:30 UTC is 23:30 the previous local day.
    expect(hourBucket('2026-06-09T04:30:00.000Z')).toBe('2026-06-08 23');
  });
});

describe('formatClock', () => {
  it('renders a normalized camp-tz clock label', () => {
    expect(formatClock('2026-06-08T13:00:00.000Z')).toBe('8:00 AM');
    expect(formatClock('2026-06-08T18:30:00.000Z')).toBe('1:30 PM');
  });
});

