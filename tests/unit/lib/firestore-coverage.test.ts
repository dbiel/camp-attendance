import { describe, it, expect, vi } from 'vitest';

// Fake data keyed by Firestore collection name.
// Notes on collection names:
//   sessionsCol()       → 'sessions'
//   periodsCol()        → 'periods'   (accessed via getPeriods() → .orderBy().get())
//   facultyCol()        → 'faculty'   (accessed via getFaculty() → .get())
//   sessionStudentsCol()→ 'session_students'
//   attendanceCol()     → 'attendance'
const fakeDocs: Record<string, any[]> = {
  sessions: [
    {
      id: 's1',
      period_id: 'p1',
      name: 'Brass Sectional',
      type: 'sectional',
      faculty_id: 'f1',
      ensemble: 'Band 1',
      instrument: 'Trumpet',
    },
  ],
  periods: [
    { id: 'p1', number: 1, name: 'Period 1', start_time: '8:00', end_time: '8:50' },
  ],
  faculty: [{ id: 'f1', first_name: 'John', last_name: 'Smith', role: 'Faculty', created_at: '' }],
  session_students: [
    { id: 's1_u1', session_id: 's1', student_id: 'u1' },
    { id: 's1_u2', session_id: 's1', student_id: 'u2' },
    { id: 's1_u3', session_id: 's1', student_id: 'u3' },
  ],
  attendance: [
    { id: 'a1', session_id: 's1', student_id: 'u1', date: '2026-06-08', status: 'present' },
    { id: 'a2', session_id: 's1', student_id: 'u2', date: '2026-06-08', status: 'absent' },
    // u3 is unmarked — no attendance doc for this date
  ],
};

// Minimal stub: collection() returns an object whose .where().get()
// (and bare .get() and .orderBy().get()) yields a snapshot.
// Any doc that exists as an entry in fakeDocs with a matching `id` field is used.
const toSnap = (rows: any[]) => ({
  empty: rows.length === 0,
  size: rows.length,
  docs: rows.map((d: any) => ({ id: d.id, data: () => d })),
});

const collectionStub = (name: string) => {
  const all = fakeDocs[name] ?? [];
  return {
    get: async () => toSnap(all),
    where: (field: string, _op: string, value: any) => ({
      get: async () => toSnap(all.filter((d: any) => d[field] === value)),
    }),
    orderBy: (_field: string) => ({
      get: async () => toSnap(all),
    }),
    doc: (id: string) => ({
      get: async () => {
        const d = all.find((x: any) => x.id === id);
        return { exists: !!d, data: () => d };
      },
    }),
  };
};

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => collectionStub(name),
  },
}));

import { getDayCoverage } from '@/lib/firestore';

describe('getDayCoverage', () => {
  it('returns one row per session with marked + absent counts', async () => {
    const rows = await getDayCoverage('2026-06-08');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      session_id: 's1',
      session_name: 'Brass Sectional',
      period_id: 'p1',
      period_number: 1,
      period_name: 'Period 1',
      start_time: '8:00',
      end_time: '8:50',
      ensemble: 'Band 1',
      instrument: 'Trumpet',
      faculty_id: 'f1',
      teacher_name: 'John Smith',
      total_students: 3,
      marked_count: 2,  // u1 (present) + u2 (absent) both have docs → marked
      absent_count: 1,  // only u2 is absent
    });
  });

  it('returns empty array when no sessions exist', async () => {
    // Temporarily override with empty sessions
    const original = fakeDocs.sessions;
    fakeDocs.sessions = [];
    const rows = await getDayCoverage('2026-06-08');
    expect(rows).toHaveLength(0);
    fakeDocs.sessions = original;
  });

  it('has zero marked_count and absent_count on a date with no attendance', async () => {
    const rows = await getDayCoverage('2026-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].marked_count).toBe(0);
    expect(rows[0].absent_count).toBe(0);
    expect(rows[0].total_students).toBe(3);
  });
});
