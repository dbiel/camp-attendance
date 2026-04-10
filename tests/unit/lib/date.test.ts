import { describe, it, expect } from 'vitest';
import { getTodayDate, getCurrentTimeHHMM } from '@/lib/date';

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
