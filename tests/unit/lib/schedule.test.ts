import { describe, it, expect } from 'vitest';
import { currentAndNextSession, formatNextLabel, type ScheduleSlot } from '@/lib/schedule';

const slot = (over: Partial<ScheduleSlot>): ScheduleSlot => ({
  session_id: 's',
  name: 'X',
  type: 'rehearsal',
  location: null,
  period_number: 1,
  start_time: '08:00',
  end_time: '08:50',
  ...over,
});

const SLOTS: ScheduleSlot[] = [
  slot({ session_id: 'p1', name: 'BAND 4', period_number: 1, start_time: '08:00', end_time: '08:50' }),
  slot({ session_id: 'p2', name: 'Sectional', period_number: 2, start_time: '09:00', end_time: '09:50' }),
  slot({ session_id: 'lunch', name: 'Lunch', period_number: 5, start_time: '12:00', end_time: '12:50', location: 'SUB Ballroom' }),
];

describe('currentAndNextSession', () => {
  it('inside a period → that session is current, the following is next', () => {
    const { current, next } = currentAndNextSession(SLOTS, '08:30');
    expect(current?.session_id).toBe('p1');
    expect(next?.session_id).toBe('p2');
  });

  it('in a gap between periods → no current (strict windows), next is upcoming', () => {
    const { current, next } = currentAndNextSession(SLOTS, '08:55');
    expect(current).toBeNull();
    expect(next?.session_id).toBe('p2');
  });

  it('before the day starts → no current, first session is next', () => {
    const { current, next } = currentAndNextSession(SLOTS, '07:00');
    expect(current).toBeNull();
    expect(next?.session_id).toBe('p1');
  });

  it('during the last session → current set, no next', () => {
    const { current, next } = currentAndNextSession(SLOTS, '12:30');
    expect(current?.session_id).toBe('lunch');
    expect(next).toBeNull();
  });

  it('after the day ends → neither', () => {
    expect(currentAndNextSession(SLOTS, '22:00')).toEqual({ current: null, next: null });
  });

  it('malformed now → neither', () => {
    expect(currentAndNextSession(SLOTS, 'noon')).toEqual({ current: null, next: null });
  });
});

describe('formatNextLabel', () => {
  it('name · time · room', () => {
    expect(formatNextLabel(SLOTS[2])).toBe('Lunch · 12:00 · SUB Ballroom');
  });
  it('(no room) when location blank', () => {
    expect(formatNextLabel(SLOTS[0])).toBe('BAND 4 · 08:00 · (no room)');
  });
  it('end of day when null', () => {
    expect(formatNextLabel(null)).toBe('Done for the day');
  });
});
