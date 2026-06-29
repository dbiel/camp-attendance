import { describe, it, expect } from 'vitest';
import { resolveEnsembleNow } from '@/lib/schedule';
import type { ScheduleSlot } from '@/lib/schedule';

const slot = (over: Partial<ScheduleSlot>): ScheduleSlot => ({
  session_id: 's', name: 'Rehearsal', type: 'rehearsal', location: 'Hemmle',
  period_number: 0, start_time: '00:00', end_time: '00:00', ...over,
});

// Orchestra-1-like back-to-back morning block + afternoon block, plus a sectional
// (non-rehearsal) that must be ignored by the gate.
const slots: ScheduleSlot[] = [
  slot({ session_id: 'r2', period_number: 2, start_time: '09:00', end_time: '09:50' }),
  slot({ session_id: 'r3', period_number: 3, start_time: '10:00', end_time: '10:50' }),
  slot({ session_id: 'r9', period_number: 9, start_time: '16:00', end_time: '16:50' }),
  slot({ session_id: 'sec', type: 'sectional', period_number: 5, start_time: '12:00', end_time: '12:50' }),
];

describe('resolveEnsembleNow', () => {
  it('inside a rehearsal window → status rehearsal with that slot', () => {
    const r = resolveEnsembleNow(slots, '10:15');
    expect(r.status).toBe('rehearsal');
    expect(r.current?.session_id).toBe('r3');
    expect(r.current?.period_number).toBe(3);
  });

  it('back-to-back: 09:30 picks period 2, next is period 3', () => {
    const r = resolveEnsembleNow(slots, '09:30');
    expect(r.current?.period_number).toBe(2);
    expect(r.next?.period_number).toBe(3);
  });

  it('end of window is exclusive → 09:50 is between blocks (no rehearsal)', () => {
    const r = resolveEnsembleNow(slots, '09:50');
    expect(r.status).toBe('no_rehearsal');
    expect(r.next?.period_number).toBe(3);
  });

  it('passing time at noon (only a sectional) → no rehearsal, next is afternoon block', () => {
    const r = resolveEnsembleNow(slots, '12:10');
    expect(r.status).toBe('no_rehearsal');
    expect(r.next?.period_number).toBe(9);
  });

  it('after the last rehearsal → no rehearsal, next null', () => {
    const r = resolveEnsembleNow(slots, '18:00');
    expect(r.status).toBe('no_rehearsal');
    expect(r.next).toBeNull();
  });
});
