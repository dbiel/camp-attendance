import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  snap: { exists: false, data: () => undefined as unknown } as { exists: boolean; data: () => unknown },
  set: vi.fn(),
  update: vi.fn(),
  shouldThrow: false,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ id: 'k' }) }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) => {
      if (h.shouldThrow) throw new Error('firestore down');
      return fn({
        get: async () => h.snap,
        set: (_ref: unknown, data: unknown) => h.set(data),
        update: (_ref: unknown, data: unknown) => h.update(data),
      });
    },
  },
}));

import { checkRateLimitDurable } from '@/lib/rate-limit';

const opts = { max: 3, windowMs: 60_000 };

beforeEach(() => {
  vi.clearAllMocks();
  h.snap = { exists: false, data: () => undefined };
  h.shouldThrow = false;
});

describe('checkRateLimitDurable', () => {
  it('allows + initializes the bucket on first hit', async () => {
    expect(await checkRateLimitDurable('e-submit:tok', opts)).toBe(true);
    expect(h.set).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it('allows + increments while under the cap', async () => {
    h.snap = { exists: true, data: () => ({ count: 1, resetAt: Date.now() + 50_000 }) };
    expect(await checkRateLimitDurable('e-submit:tok', opts)).toBe(true);
    expect(h.update).toHaveBeenCalledWith({ count: 2 });
  });

  it('blocks once the cap is reached within the window', async () => {
    h.snap = { exists: true, data: () => ({ count: 3, resetAt: Date.now() + 50_000 }) };
    expect(await checkRateLimitDurable('e-submit:tok', opts)).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('resets once the window has elapsed', async () => {
    h.snap = { exists: true, data: () => ({ count: 99, resetAt: Date.now() - 1 }) };
    expect(await checkRateLimitDurable('e-submit:tok', opts)).toBe(true);
    expect(h.set).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it('fails OPEN if Firestore errors (never lock out legit staff)', async () => {
    h.shouldThrow = true;
    expect(await checkRateLimitDurable('e-submit:tok', opts)).toBe(true);
  });
});
