/**
 * Unit tests for markAttendanceBatch — chunking + skip logic.
 *
 * Uses a fully mocked adminDb to verify that writes are split across
 * Firestore WriteBatch objects at the 400-op boundary and that items
 * whose student/session can't be resolved are reported as skipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test state for the mock adminDb.
const state = {
  // Returned by collection().doc(id).get() depending on path.
  studentDocs: new Map<string, any>(),
  sessionDocs: new Map<string, any>(),
  periodDocs: new Map<string, any>(),
  facultyDocs: new Map<string, any>(),
  // Captures every batch commit; each entry is the set of ops for that chunk.
  commits: [] as Array<Array<{ docId: string; data: any }>>,
};

function makeDocSnapshot(exists: boolean, data?: any, id = 'x') {
  return { exists, id, data: () => data };
}

vi.mock('@/lib/firebase-admin', () => {
  const batches: Array<{ ops: Array<{ docId: string; data: any }> }> = [];
  return {
    adminDb: {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (name === 'students') {
              const d = state.studentDocs.get(id);
              return makeDocSnapshot(!!d, d, id);
            }
            if (name === 'sessions') {
              const d = state.sessionDocs.get(id);
              return makeDocSnapshot(!!d, d, id);
            }
            if (name === 'periods') {
              const d = state.periodDocs.get(id);
              return makeDocSnapshot(!!d, d, id);
            }
            if (name === 'faculty') {
              const d = state.facultyDocs.get(id);
              return makeDocSnapshot(!!d, d, id);
            }
            return makeDocSnapshot(false);
          },
          // Only the batch writes `set`; it goes through batch.set(ref, data),
          // so this isn't strictly exercised, but keep the shape.
          set: vi.fn(),
          _collection: name,
          _id: id,
        }),
      }),
      batch: () => {
        const ops: Array<{ docId: string; data: any }> = [];
        batches.push({ ops });
        return {
          set: (ref: any, data: any) => {
            ops.push({ docId: ref._id, data });
          },
          commit: async () => {
            state.commits.push(ops);
          },
        };
      },
    },
  };
});

import { markAttendanceBatch } from '@/lib/firestore';

function seedOne() {
  state.studentDocs.set('s1', {
    first_name: 'Alice',
    last_name: 'Anderson',
    last_initial: 'A',
    instrument: 'Flute',
    ensemble: 'Concert Band',
    division: 'Residential',
    created_at: 'x',
  });
  state.sessionDocs.set('sess1', {
    name: 'Concert Band Rehearsal',
    period_id: 'p1',
    faculty_id: 'f1',
    type: 'rehearsal',
  });
  state.periodDocs.set('p1', { number: 1, name: 'Period 1', start_time: '08:00', end_time: '08:50' });
  state.facultyDocs.set('f1', { first_name: 'Dr. Sarah', last_name: 'Williams', role: 'Director' });
}

describe('markAttendanceBatch', () => {
  beforeEach(() => {
    state.studentDocs.clear();
    state.sessionDocs.clear();
    state.periodDocs.clear();
    state.facultyDocs.clear();
    state.commits = [];
  });

  it('returns zero counts on empty input', async () => {
    const res = await markAttendanceBatch([], 'admin:u1');
    expect(res.written).toBe(0);
    expect(res.skipped).toBe(0);
    expect(res.errors).toEqual([]);
    expect(state.commits).toHaveLength(0);
  });

  it('writes all items in a single batch when ≤400', async () => {
    seedOne();
    const items = Array.from({ length: 50 }, () => ({
      student_id: 's1',
      session_id: 'sess1',
      date: '2026-06-08',
      status: 'present' as const,
    }));

    const res = await markAttendanceBatch(items, 'admin:u1');
    expect(res.written).toBe(50);
    expect(res.skipped).toBe(0);
    expect(state.commits).toHaveLength(1);
    expect(state.commits[0]!.length).toBe(50);
  });

  it('chunks writes into batches of 400 at the boundary', async () => {
    seedOne();
    const items = Array.from({ length: 450 }, () => ({
      student_id: 's1',
      session_id: 'sess1',
      date: '2026-06-08',
      status: 'present' as const,
    }));

    const res = await markAttendanceBatch(items, 'admin:u1');
    expect(res.written).toBe(450);
    expect(state.commits).toHaveLength(2);
    expect(state.commits[0]!.length).toBe(400);
    expect(state.commits[1]!.length).toBe(50);
  });

  it('skips items with unresolved student and reports reason', async () => {
    seedOne();
    const items = [
      { student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'present' as const },
      { student_id: 'MISSING', session_id: 'sess1', date: '2026-06-08', status: 'present' as const },
    ];
    const res = await markAttendanceBatch(items, 'admin:u1');
    expect(res.written).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.index).toBe(1);
    expect(res.errors[0]!.reason).toMatch(/student/);
  });

  it('uses server-derived markedBy in written docs', async () => {
    seedOne();
    const items = [
      { student_id: 's1', session_id: 'sess1', date: '2026-06-08', status: 'present' as const },
    ];
    await markAttendanceBatch(items, 'teacher:1.2.3.4');
    expect(state.commits[0]![0]!.data.marked_by).toBe('teacher:1.2.3.4');
    // Denormalized display fields must match markAttendance shape.
    expect(state.commits[0]![0]!.data.first_name).toBe('Alice');
    expect(state.commits[0]![0]!.data.teacher_name).toBe('Dr. Sarah Williams');
    // PII must NOT be denormalized (security Task 8).
    expect(state.commits[0]![0]!.data).not.toHaveProperty('parent_phone');
    expect(state.commits[0]![0]!.data).not.toHaveProperty('email');
    expect(state.commits[0]![0]!.data).not.toHaveProperty('cell_phone');
  });
});
