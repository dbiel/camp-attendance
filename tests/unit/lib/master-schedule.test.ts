import { describe, it, expect } from 'vitest';
import {
  getSessionType,
  buildByPeriod,
  TIME_SLOTS,
  SCHEDULE,
} from '@/lib/master-schedule';

describe('getSessionType', () => {
  it('classifies cells by their prefix', () => {
    expect(getSessionType('REH B6')).toBe('REH');
    expect(getSessionType('SEC B1 Perc')).toBe('SEC');
    expect(getSessionType('MASTER B4/B5 Clarinet')).toBe('MASTER');
    expect(getSessionType('ELEC JAZZ 2')).toBe('ELEC');
    expect(getSessionType('ASSEMBLY')).toBe('OTHER');
    expect(getSessionType('')).toBe('OTHER');
  });
});

describe('master schedule data', () => {
  it('has periods and rooms loaded', () => {
    expect(TIME_SLOTS.length).toBeGreaterThan(5);
    expect(SCHEDULE.length).toBeGreaterThan(5);
  });
});

describe('buildByPeriod', () => {
  it('groups every non-empty cell under its period, tagged with a type', () => {
    const periods = buildByPeriod();
    expect(periods.length).toBeGreaterThan(0);
    const flat = periods.flatMap((p) => p.sessions);
    // Every session has a room, a non-empty label, and a known type.
    expect(flat.every((c) => c.room && c.session)).toBe(true);
    expect(flat.some((c) => c.type === 'REH')).toBe(true);
    // The count equals the number of filled cells in the grid.
    const filled = SCHEDULE.reduce((n, r) => n + Object.keys(r.slots).length, 0);
    expect(flat.length).toBe(filled);
  });
});
