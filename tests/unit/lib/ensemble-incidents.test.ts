import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  roster: [] as any[],
  ensemble: 'Band 5',
  rosterNull: false,
  activeCases: [] as any[],
  studentCases: {} as Record<string, any[]>,
  events: [] as any[],
  added: [] as any[],
}));

vi.mock('@/lib/ensemble-attendance', () => ({
  getRosterForToken: async () =>
    h.rosterNull ? null : { ensemble: h.ensemble, label: null, roster: h.roster },
}));
vi.mock('@/lib/cases', () => ({
  listCases: async () => h.activeCases,
  listCasesForStudent: async (id: string) => h.studentCases[id] ?? [],
  listCaseEvents: async () => h.events,
  addCaseEvent: async (caseId: string, type: string, body: string, actor: string) => {
    h.added.push({ caseId, type, body, actor });
    return 'evt1';
  },
  getCase: async (id: string) => (h.studentCases['x']?.find((c) => c.id === id) ?? null),
}));
vi.mock('@/lib/firestore', () => ({ getStudent: async () => null }));

import {
  listActiveIncidentRefs,
  getEnsembleIncidentByRef,
  postEnsembleIncidentUpdate,
} from '@/lib/ensemble-incidents';

beforeEach(() => {
  h.roster = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  h.ensemble = 'Band 5';
  h.rosterNull = false;
  h.activeCases = [];
  h.studentCases = {};
  h.events = [];
  h.added = [];
});

describe('listActiveIncidentRefs', () => {
  it('returns the roster indices whose student has an active case', async () => {
    h.activeCases = [{ id: 'c2', student_id: 's2', status: 'active' }];
    expect(await listActiveIncidentRefs('tok')).toEqual([1]);
  });
  it('returns null for an invalid token', async () => {
    h.rosterNull = true;
    expect(await listActiveIncidentRefs('tok')).toBeNull();
  });
  it('ignores active cases for students not in this roster', async () => {
    h.activeCases = [{ id: 'cX', student_id: 'other', status: 'active' }];
    expect(await listActiveIncidentRefs('tok')).toEqual([]);
  });
});

describe('getEnsembleIncidentByRef', () => {
  it('returns the scoped projection for the active case at that ref', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'Absent', status: 'active' }];
    const p = await getEnsembleIncidentByRef('tok', 1);
    expect(p?.report_summary).toBe('Absent');
    expect(p).not.toHaveProperty('dorm_building');
  });
  it('returns null when the ref is out of range', async () => {
    expect(await getEnsembleIncidentByRef('tok', 9)).toBeNull();
  });
  it('returns null when the ref has no active case', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'old', status: 'resolved' }];
    expect(await getEnsembleIncidentByRef('tok', 1)).toBeNull();
  });
});

describe('postEnsembleIncidentUpdate', () => {
  it('appends a staff_update authored by the ensemble label', async () => {
    h.studentCases['s2'] = [{ id: 'c2', summary: 'Absent', status: 'active' }];
    const r = await postEnsembleIncidentUpdate('tok', 1, 'in the hall');
    expect(r).toEqual({ ok: true });
    expect(h.added).toEqual([{ caseId: 'c2', type: 'staff_update', body: 'in the hall', actor: 'Band 5' }]);
  });
  it('returns gone when there is no active case at the ref', async () => {
    h.studentCases['s2'] = [];
    expect(await postEnsembleIncidentUpdate('tok', 1, 'x')).toEqual({ ok: false, reason: 'gone' });
  });
  it('returns invalid for a bad token', async () => {
    h.rosterNull = true;
    expect(await postEnsembleIncidentUpdate('tok', 1, 'x')).toEqual({ ok: false, reason: 'invalid' });
  });
});
