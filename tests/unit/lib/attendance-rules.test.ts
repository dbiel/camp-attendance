import { describe, it, expect } from 'vitest';
import { deriveCellState, ATTENDANCE_MOSTLY_TAKEN_THRESHOLD } from '@/lib/attendance-rules';

describe('deriveCellState', () => {
  it('returns not-started when nothing marked', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 0, absent_count: 0 }))
      .toBe('not-started');
  });

  it('returns in-progress when some marked but under threshold and no absences', () => {
    // 80% of 20 = 16, so 15 marked is in-progress
    expect(deriveCellState({ total_students: 20, marked_count: 15, absent_count: 0 }))
      .toBe('in-progress');
  });

  it('returns mostly-done at exactly the threshold with no absences', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 16, absent_count: 0 }))
      .toBe('mostly-done');
  });

  it('returns mostly-done when all marked and none absent', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 20, absent_count: 0 }))
      .toBe('mostly-done');
  });

  it('returns has-absences whenever any absent exists, regardless of coverage', () => {
    expect(deriveCellState({ total_students: 20, marked_count: 2, absent_count: 2 }))
      .toBe('has-absences');
    expect(deriveCellState({ total_students: 20, marked_count: 20, absent_count: 3 }))
      .toBe('has-absences');
  });

  it('handles empty roster gracefully (returns not-started)', () => {
    expect(deriveCellState({ total_students: 0, marked_count: 0, absent_count: 0 }))
      .toBe('not-started');
  });

  it('exposes the threshold constant', () => {
    expect(ATTENDANCE_MOSTLY_TAKEN_THRESHOLD).toBe(0.8);
  });
});
