import { describe, it, expect, vi } from 'vitest';

// Mock the I/O collaborators so we test the period/keying logic only.
const sessions = [
  { id: 'r3', ensemble: 'Band 1', type: 'rehearsal', period_id: '3', location: 'Hemmle', name: 'Band 1 Rehearsal' },
  { id: 'r4', ensemble: 'Band 1', type: 'rehearsal', period_id: '4', location: 'Hemmle', name: 'Band 1 Rehearsal' },
];
const periods = [
  { id: '3', number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' },
  { id: '4', number: 4, name: 'Period 4A', start_time: '11:00', end_time: '11:50' },
];
vi.mock('@/lib/firestore', () => ({
  getSessions: vi.fn(async () => sessions),
  getPeriods: vi.fn(async () => periods),
}));
vi.mock('@/lib/ensemble-links', () => ({
  validateEnsembleToken: vi.fn(async (t: string) => (t === 'good' ? { ensemble: 'Band 1', label: 'Ms. G' } : null)),
  getEnsembleRoster: vi.fn(async () => [{ id: 'a', first_name: 'Al', last_name: 'X', instrument: 'Flute' }]),
}));

import { getCurrentEnsembleSession, resolveCurrentPeriod } from '@/lib/ensemble-attendance';

describe('period resolution', () => {
  it('resolveCurrentPeriod inside Period 3 → keys to period 3 + session r3', async () => {
    const cur = await resolveCurrentPeriod('Band 1', '10:20');
    expect(cur?.period_number).toBe(3);
    expect(cur?.session_id).toBe('r3');
    expect(cur?.period_name).toBe('Period 3');
  });

  it('resolveCurrentPeriod during lunch (12:30) → null', async () => {
    expect(await resolveCurrentPeriod('Band 1', '12:30')).toBeNull();
  });

  it('getCurrentEnsembleSession idle → status no_rehearsal with next hint', async () => {
    const ctx = await getCurrentEnsembleSession('good', '09:30');
    expect(ctx?.status).toBe('no_rehearsal');
    expect(ctx?.next?.period_name).toBe('Period 3');
  });

  it('getCurrentEnsembleSession in rehearsal → status rehearsal + window', async () => {
    const ctx = await getCurrentEnsembleSession('good', '11:10');
    expect(ctx?.status).toBe('rehearsal');
    expect(ctx?.period_number).toBe(4);
    expect(ctx?.end_time).toBe('11:50');
  });

  it('invalid token → null', async () => {
    expect(await getCurrentEnsembleSession('bad', '11:10')).toBeNull();
  });
});
