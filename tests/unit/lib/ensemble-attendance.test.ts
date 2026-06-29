import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mutable mock state (hoisted so the vi.mock factories can close over it).
const h = vi.hoisted(() => ({
  validateEnsembleToken: vi.fn(),
  getEnsembleRoster: vi.fn(),
  getTodayDate: vi.fn(() => '2026-06-28'),
  getCurrentTimeHHMM: vi.fn(() => '10:20'),
  getSessions: vi.fn(async () => [
    { id: 'r3', ensemble: 'Band 1', type: 'rehearsal', period_id: '3', location: 'Hemmle', name: 'Band 1 Rehearsal' },
  ]),
  getPeriods: vi.fn(async () => [
    { id: '3', number: 3, name: 'Period 3', start_time: '10:00', end_time: '10:50' },
  ]),
  buildCaseDoc: vi.fn((input: Record<string, unknown>) => ({ kind: 'case', ...input })),
  buildEventDoc: vi.fn((caseId: string, type: string, body: string, actor: string) => ({
    kind: 'event',
    caseId,
    type,
    body,
    actor,
  })),
  submissionSnap: { exists: false, data: () => undefined as unknown } as {
    exists: boolean;
    data: () => unknown;
  },
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  idSeq: { n: 0 },
  markedMap: new Map<string, { id: string; status: string; date: string; from: string; until: string; student_id: string }>(),
  cleared: [] as string[],
}));

vi.mock('@/lib/ensemble-links', () => ({
  validateEnsembleToken: h.validateEnsembleToken,
  getEnsembleRoster: h.getEnsembleRoster,
}));
vi.mock('@/lib/date', () => ({ getTodayDate: h.getTodayDate, getCurrentTimeHHMM: h.getCurrentTimeHHMM }));
vi.mock('@/lib/firestore', () => ({ getSessions: h.getSessions, getPeriods: h.getPeriods }));
vi.mock('@/lib/cases', () => ({
  buildCaseDoc: h.buildCaseDoc,
  buildEventDoc: h.buildEventDoc,
  CASES_COLLECTION: 'cases',
  EVENTS_COLLECTION: 'case_events',
}));
vi.mock('@/lib/marked-absences', () => ({
  activeMarkedAbsencesForStudents: async () => h.markedMap,
  clearMarkedAbsence: async (id: string) => { h.cleared.push(id); },
}));
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => ({ id: id ?? `gen_${name}_${h.idSeq.n++}`, col: name }),
    }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: async () => h.submissionSnap,
        set: (ref: { col: string; id: string }, data: unknown) => h.txSet(ref.col, ref.id, data),
        update: (ref: { col: string; id: string }, data: unknown) => h.txUpdate(ref.col, ref.id, data),
      }),
  },
}));

import { submitEnsembleAttendance } from '@/lib/ensemble-attendance';

const student = (id: string) => ({
  id,
  first_name: id.toUpperCase(),
  last_name: `Last${id}`,
  instrument: 'Trumpet',
  ensemble: 'Band 1',
  division: 'HS',
  dorm_building: 'Wall',
  dorm_room: '101',
});

/** The persisted submission payload (the doc written to ensemble_attendance). */
function savedSubmission() {
  const call = h.txSet.mock.calls.find((c) => c[0] === 'ensemble_attendance');
  return call?.[2] as { marks: Record<string, string>; case_ids: Record<string, string> } | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.validateEnsembleToken.mockResolvedValue({ ensemble: 'Band 1', label: 'Mr. Lee' });
  h.getEnsembleRoster.mockResolvedValue([student('a'), student('b')]); // idSorted → a,b
  h.submissionSnap = { exists: false, data: () => undefined };
  h.idSeq.n = 0;
  h.markedMap = new Map();
  h.cleared = [];
});

describe('submitEnsembleAttendance', () => {
  it('invalid token → not_found, files nothing', async () => {
    h.validateEnsembleToken.mockResolvedValue(null);
    const res = await submitEnsembleAttendance({ token: 'bad', marksByRef: { 0: 'absent' } });
    expect(res).toEqual({ ok: false, reason: 'not_found' });
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
  });

  it('roster size mismatch → roster_changed, files nothing', async () => {
    const res = await submitEnsembleAttendance({
      token: 't',
      marksByRef: { 0: 'absent' },
      expectedRosterSize: 5,
    });
    expect(res).toEqual({ ok: false, reason: 'roster_changed' });
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
  });

  it('first submit: each absent files ONE report (atomically); present files nothing', async () => {
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent', 1: 'present' } });
    expect(res.ok).toBe(true);
    expect(h.buildCaseDoc).toHaveBeenCalledTimes(1);
    expect(h.buildCaseDoc.mock.calls[0][0]).toMatchObject({ student_id: 'a', source: 'ensemble_attendance' });
    // submission persisted with the case-id map + both marks
    const saved = savedSubmission();
    expect(saved?.marks).toEqual({ a: 'absent', b: 'present' });
    expect(Object.keys(saved?.case_ids ?? {})).toEqual(['a']);
    if (res.ok) expect(res.newly_absent).toBe(1);
  });

  it('only in-range refs are honored (out-of-range dropped)', async () => {
    await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent', 9: 'absent' } });
    expect(h.buildCaseDoc).toHaveBeenCalledTimes(1);
  });

  it('dedup: re-submitting the same absence files no new report', async () => {
    h.submissionSnap = {
      exists: true,
      data: () => ({ marks: { a: 'absent' }, case_ids: { a: 'C1' }, submitted_at: 'x' }),
    };
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent' } });
    expect(res.ok).toBe(true);
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
  });

  it('Absent→Present flips the existing report to tardy-arrived (no new report)', async () => {
    h.submissionSnap = {
      exists: true,
      data: () => ({ marks: { a: 'absent' }, case_ids: { a: 'C1' }, submitted_at: 'x' }),
    };
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'present' } });
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
    expect(h.txUpdate).toHaveBeenCalledWith('cases', 'C1', expect.objectContaining({ tardy_arrived: true }));
    expect(h.buildEventDoc).toHaveBeenCalledWith('C1', 'note', expect.stringContaining('tardy'), 'ensemble:Band 1', expect.any(String));
    if (res.ok) expect(res.arrived_count).toBe(1);
  });

  it('no scheduled rehearsal and not forced → no_rehearsal, files nothing', async () => {
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent' }, nowHHMM: '12:30' });
    expect(res).toEqual({ ok: false, reason: 'no_rehearsal' });
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
  });

  it('force-open: no rehearsal but force:true files attendance for the clock hour', async () => {
    const res = await submitEnsembleAttendance({
      token: 't',
      marksByRef: { 0: 'absent' },
      force: true,
      nowHHMM: '12:30',
    });
    expect(res.ok).toBe(true);
    expect(h.buildCaseDoc).toHaveBeenCalledTimes(1);
    expect(h.buildCaseDoc.mock.calls[0][0]).toMatchObject({ student_id: 'a', period_id: 'H12' });
  });

  it('Present→Absent after submit files a report for the newly-absent kid', async () => {
    h.submissionSnap = {
      exists: true,
      data: () => ({ marks: { a: 'present', b: 'present' }, case_ids: {}, submitted_at: 'x' }),
    };
    await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent', 1: 'present' } });
    expect(h.buildCaseDoc).toHaveBeenCalledTimes(1);
    expect(h.buildCaseDoc.mock.calls[0][0]).toMatchObject({ student_id: 'a' });
  });

  it('office-absent kid marked absent → NO incident filed', async () => {
    h.markedMap = new Map([['a', { id: 'm1', status: 'active', date: '2026-06-28', from: '00:00', until: '23:59', student_id: 'a' }]]);
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'absent', 1: 'absent' } });
    expect(res.ok).toBe(true);
    // only student b (not office-marked) files a case
    expect(h.buildCaseDoc).toHaveBeenCalledTimes(1);
    expect(h.buildCaseDoc.mock.calls[0][0]).toMatchObject({ student_id: 'b' });
  });

  it('office-absent kid marked PRESENT (arrived) → absence cleared, no case', async () => {
    h.markedMap = new Map([['a', { id: 'm1', status: 'active', date: '2026-06-28', from: '00:00', until: '23:59', student_id: 'a' }]]);
    const res = await submitEnsembleAttendance({ token: 't', marksByRef: { 0: 'present' } });
    expect(res.ok).toBe(true);
    expect(h.buildCaseDoc).not.toHaveBeenCalled();
    expect(h.cleared).toEqual(['m1']);
  });
});
