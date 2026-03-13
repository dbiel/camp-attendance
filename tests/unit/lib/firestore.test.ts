/**
 * Firestore Data Layer Unit Tests
 *
 * Tests utility functions and data transformation logic.
 * Uses mocked adminDb to avoid hitting real Firestore.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockGet = vi.fn();
const mockAdd = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: any[]) => {
      mockCollection(...args);
      return {
        doc: (...dArgs: any[]) => {
          mockDoc(...dArgs);
          return {
            get: mockGet,
            set: mockSet,
            update: mockUpdate,
            delete: mockDelete,
          };
        },
        get: mockGet,
        add: mockAdd,
        where: (...wArgs: any[]) => {
          mockWhere(...wArgs);
          return { get: mockGet };
        },
        orderBy: (...oArgs: any[]) => {
          mockOrderBy(...oArgs);
          return { get: mockGet };
        },
      };
    },
  },
}));

import { getTodayDate, createStudent, updateStudent } from '@/lib/firestore';

describe('getTodayDate', () => {
  it('returns date in YYYY-MM-DD format', () => {
    const result = getTodayDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today\'s date', () => {
    const expected = new Date().toISOString().split('T')[0];
    expect(getTodayDate()).toBe(expected);
  });
});

describe('createStudent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'new-student-id' });
  });

  it('computes last_initial from last_name', async () => {
    await createStudent({
      first_name: 'Test',
      last_name: 'Williams',
      division: 'Residential',
      instrument: 'Flute',
      ensemble: 'Concert Band',
    } as any);

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        last_initial: 'W',
        first_name: 'Test',
        last_name: 'Williams',
      })
    );
  });

  it('sets last_initial to empty string when no last_name', async () => {
    await createStudent({
      first_name: 'Test',
      last_name: '',
      division: 'Residential',
      instrument: 'Flute',
      ensemble: 'Concert Band',
    } as any);

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ last_initial: '' })
    );
  });

  it('adds created_at timestamp', async () => {
    await createStudent({
      first_name: 'Test',
      last_name: 'User',
      division: 'Commuter',
      instrument: 'Violin',
      ensemble: 'Orchestra',
    } as any);

    const callArg = mockAdd.mock.calls[0][0];
    expect(callArg.created_at).toBeDefined();
    expect(callArg.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('updateStudent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('recomputes last_initial when last_name is updated', async () => {
    await updateStudent('student-1', { last_name: 'Newname' });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        last_name: 'Newname',
        last_initial: 'N',
      })
    );
  });

  it('does not touch last_initial when last_name is not updated', async () => {
    await updateStudent('student-1', { first_name: 'Updated' });

    expect(mockUpdate).toHaveBeenCalledWith({
      first_name: 'Updated',
    });
  });

  it('does nothing when data is empty', async () => {
    await updateStudent('student-1', {});
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
