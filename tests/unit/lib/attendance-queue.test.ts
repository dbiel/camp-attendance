/**
 * Attendance Offline Queue Unit Tests
 *
 * Tests localStorage-backed FIFO queue with (student_id, session_id, date) dedupe.
 * Manually mocks localStorage since jsdom environment has issues in Vitest 4.x
 * (same pattern as tests/unit/lib/camp-code.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the module under test.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key in store) delete store[key];
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import {
  enqueue,
  peek,
  size,
  clear,
  flush,
  type AttendanceQueueItem,
} from '@/lib/attendance-queue';

const makeItem = (
  overrides: Partial<AttendanceQueueItem> = {}
): AttendanceQueueItem => ({
  student_id: 's1',
  session_id: 'sess1',
  date: '2026-06-08',
  status: 'present',
  queuedAt: 1000,
  ...overrides,
});

describe('attendance-queue', () => {
  beforeEach(() => {
    for (const key in store) delete store[key];
    vi.clearAllMocks();
  });

  it('enqueue adds an item and size() reports 1', () => {
    expect(size()).toBe(0);
    enqueue(makeItem());
    expect(size()).toBe(1);
  });

  it('enqueue dedupes: same student_id|session_id|date replaces prior entry', () => {
    enqueue(makeItem({ status: 'present', queuedAt: 1 }));
    enqueue(makeItem({ status: 'absent', queuedAt: 2 }));
    expect(size()).toBe(1);
    expect(peek()).toMatchObject({ status: 'absent', queuedAt: 2 });
  });

  it('enqueue keeps distinct items when dedupe key differs', () => {
    enqueue(makeItem({ student_id: 's1' }));
    enqueue(makeItem({ student_id: 's2' }));
    enqueue(makeItem({ student_id: 's1', session_id: 'sess2' }));
    enqueue(makeItem({ student_id: 's1', date: '2026-06-09' }));
    expect(size()).toBe(4);
  });

  it('peek returns head item without removing it', () => {
    enqueue(makeItem({ student_id: 's1', queuedAt: 1 }));
    enqueue(makeItem({ student_id: 's2', queuedAt: 2 }));
    const head = peek();
    expect(head).toMatchObject({ student_id: 's1' });
    expect(size()).toBe(2);
  });

  it('peek returns undefined when empty', () => {
    expect(peek()).toBeUndefined();
  });

  it('clear empties the queue', () => {
    enqueue(makeItem({ student_id: 's1' }));
    enqueue(makeItem({ student_id: 's2' }));
    clear();
    expect(size()).toBe(0);
    expect(peek()).toBeUndefined();
  });

  it('flush with success sender drains the queue', async () => {
    enqueue(makeItem({ student_id: 's1' }));
    enqueue(makeItem({ student_id: 's2' }));
    enqueue(makeItem({ student_id: 's3' }));
    const sender = vi.fn().mockResolvedValue(true);
    await flush(sender);
    expect(sender).toHaveBeenCalledTimes(3);
    expect(size()).toBe(0);
  });

  it('flush stops at first failure and leaves remaining items queued', async () => {
    enqueue(makeItem({ student_id: 's1' }));
    enqueue(makeItem({ student_id: 's2' }));
    enqueue(makeItem({ student_id: 's3' }));
    const sender = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await flush(sender);
    // sender called for s1 (ok), s2 (fail) — stops. s3 never attempted.
    expect(sender).toHaveBeenCalledTimes(2);
    expect(size()).toBe(2);
    expect(peek()).toMatchObject({ student_id: 's2' });
  });

  it('flush on empty queue is a no-op', async () => {
    const sender = vi.fn().mockResolvedValue(true);
    await flush(sender);
    expect(sender).not.toHaveBeenCalled();
    expect(size()).toBe(0);
  });
});
