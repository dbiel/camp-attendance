import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  addMock: vi.fn(),
  docGetMock: vi.fn(),
  docUpdateMock: vi.fn(),
  queryGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => {
  const queryable = {
    where: vi.fn(() => queryable),
    orderBy: vi.fn(() => queryable),
    limit: vi.fn(() => queryable),
    get: state.queryGetMock,
  };
  return {
    adminDb: {
      collection: () => ({
        add: state.addMock,
        doc: () => ({ get: state.docGetMock, update: state.docUpdateMock }),
        ...queryable,
      }),
    },
  };
});

import { createCase, resolveCase, addCaseEvent } from '@/lib/cases';

beforeEach(() => vi.clearAllMocks());

describe('createCase', () => {
  it('creates an active case with a 32-char hex share token and a report event', async () => {
    state.addMock.mockResolvedValueOnce({ id: 'case1' }).mockResolvedValueOnce({ id: 'ev1' });
    const id = await createCase({
      student_id: 's1',
      student_name: 'Johnny Smith',
      reporter_contact_id: 'c1',
      reporter_name: 'Mr. Jones',
      summary: 'Missing from trumpet sectional',
      raw_text: 'johnny smith not in sectional',
      created_by: 'david@bieldentalcabinets.com',
    });
    expect(id).toBe('case1');
    const caseDoc = state.addMock.mock.calls[0][0];
    expect(caseDoc.status).toBe('active');
    expect(caseDoc.share_token).toMatch(/^[0-9a-f]{32}$/);
    const eventDoc = state.addMock.mock.calls[1][0];
    expect(eventDoc).toMatchObject({ case_id: 'case1', type: 'report_received' });
  });
});

describe('resolveCase', () => {
  it('sets status resolved + resolution note and appends a timeline event', async () => {
    state.addMock.mockResolvedValue({ id: 'ev2' });
    await resolveCase('case1', 'Found at dining hall', 'david@bieldentalcabinets.com');
    expect(state.docUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved', resolution_note: 'Found at dining hall' })
    );
    expect(state.addMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'resolved', body: 'Found at dining hall' })
    );
  });
});

describe('addCaseEvent', () => {
  it('writes a timeline event with actor and timestamp', async () => {
    state.addMock.mockResolvedValue({ id: 'ev3' });
    await addCaseEvent('case1', 'parent_texted', 'Texted parent at +1806…', 'david@bieldentalcabinets.com');
    const ev = state.addMock.mock.calls[0][0];
    expect(ev).toMatchObject({ case_id: 'case1', type: 'parent_texted', actor: 'david@bieldentalcabinets.com' });
    expect(typeof ev.created_at).toBe('string');
  });
});
