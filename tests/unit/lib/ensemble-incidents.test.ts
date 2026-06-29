import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  roster: [] as any[],
  ensemble: 'Band 5',
  rosterNull: false,
  active: [] as any[],
  resolved: [] as any[],
  studentCases: {} as Record<string, any[]>,
  events: [] as any[],
  added: [] as any[],
}));

vi.mock('@/lib/ensemble-attendance', () => ({
  getRosterForToken: async () =>
    h.rosterNull ? null : { ensemble: h.ensemble, label: null, roster: h.roster },
}));
vi.mock('@/lib/cases', () => ({
  listCases: async (status: string) => (status === 'resolved' ? h.resolved : h.active),
  listCasesForStudent: async (id: string) => h.studentCases[id] ?? [],
  listCaseEvents: async () => h.events,
  addCaseEvent: async (caseId: string, type: string, body: string, actor: string) => {
    h.added.push({ caseId, type, body, actor });
    return 'evt1';
  },
}));
vi.mock('@/lib/firestore', () => ({ getStudent: async () => null }));
// Deterministic camp-tz: today = 2026-06-29; campDate = the ISO's date part.
vi.mock('@/lib/date', () => ({
  getTodayDate: () => '2026-06-29',
  hourBucket: (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 13)}`,
}));

import {
  listTodayReportRefs,
  getEnsembleReportByRef,
  postEnsembleIncidentUpdate,
} from '@/lib/ensemble-incidents';

const TODAY = '2026-06-29T13:00:00Z';
const YESTERDAY = '2026-06-28T13:00:00Z';

beforeEach(() => {
  h.roster = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  h.ensemble = 'Band 5';
  h.rosterNull = false;
  h.active = [];
  h.resolved = [];
  h.studentCases = {};
  h.events = [];
  h.added = [];
});

describe('listTodayReportRefs', () => {
  it('includes today active AND today resolved, by roster ref', async () => {
    h.active = [{ id: 'a', student_id: 's2', status: 'active', occurred_at: TODAY }];
    h.resolved = [{ id: 'r', student_id: 's1', status: 'resolved', occurred_at: TODAY }];
    expect(await listTodayReportRefs('tok')).toEqual([0, 1]);
  });
  it('excludes a report from a previous day', async () => {
    h.resolved = [{ id: 'r', student_id: 's1', status: 'resolved', occurred_at: YESTERDAY }];
    expect(await listTodayReportRefs('tok')).toEqual([]);
  });
  it('excludes students not in this roster', async () => {
    h.active = [{ id: 'x', student_id: 'other', status: 'active', occurred_at: TODAY }];
    expect(await listTodayReportRefs('tok')).toEqual([]);
  });
  it('returns null for an invalid token', async () => {
    h.rosterNull = true;
    expect(await listTodayReportRefs('tok')).toBeNull();
  });
});

describe('getEnsembleReportByRef', () => {
  it('returns the most-recent today case (resolved) with status + resolution_note', async () => {
    h.studentCases['s2'] = [
      { id: 'c2', summary: 'Absent', status: 'resolved', resolution_note: 'found in dorm', occurred_at: TODAY },
      { id: 'c1', summary: 'older', status: 'resolved', occurred_at: YESTERDAY },
    ];
    const p = await getEnsembleReportByRef('tok', 1);
    expect(p?.report_summary).toBe('Absent');
    expect(p?.status).toBe('resolved');
    expect(p?.resolution_note).toBe('found in dorm');
  });
  it('returns null when the ref has no today case', async () => {
    h.studentCases['s2'] = [{ id: 'c1', summary: 'old', status: 'resolved', occurred_at: YESTERDAY }];
    expect(await getEnsembleReportByRef('tok', 1)).toBeNull();
  });
  it('returns null for an out-of-range ref', async () => {
    expect(await getEnsembleReportByRef('tok', 9)).toBeNull();
  });
});

describe('postEnsembleIncidentUpdate', () => {
  it('appends a staff_update to the active case authored by the ensemble label', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'Absent', status: 'active', occurred_at: TODAY }];
    const r = await postEnsembleIncidentUpdate('tok', 1, 'in the hall');
    expect(r).toEqual({ ok: true });
    expect(h.added).toEqual([{ caseId: 'c2', type: 'staff_update', body: 'in the hall', actor: 'Band 5' }]);
  });
  it('returns gone when there is no active case at the ref', async () => {
    h.studentCases['s2'] = [{ id: 'c2', status: 'resolved', occurred_at: TODAY }];
    expect(await postEnsembleIncidentUpdate('tok', 1, 'x')).toEqual({ ok: false, reason: 'gone' });
  });
  it('returns invalid for a bad token', async () => {
    h.rosterNull = true;
    expect(await postEnsembleIncidentUpdate('tok', 1, 'x')).toEqual({ ok: false, reason: 'invalid' });
  });
});
