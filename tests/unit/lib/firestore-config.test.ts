/**
 * Unit tests for camp config Firestore helpers: setCampConfig and rotateCampCode.
 *
 * Mocks adminDb and camp-config.invalidateCampConfigCache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockSet, mockUpdate, invalidateCampConfigCacheMock } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockUpdate: vi.fn(),
  invalidateCampConfigCacheMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
      }),
    }),
  },
}));

vi.mock('@/lib/camp-config', () => ({
  invalidateCampConfigCache: invalidateCampConfigCacheMock,
}));

import { setCampConfig, rotateCampCode } from '@/lib/firestore';

const BASE = {
  camp_id: '2026',
  camp_code: 'ABC23456',
  camp_year: 2026,
  start_date: '2026-06-08',
  end_date: '2026-06-13',
  timezone: 'America/Chicago',
  day_dates: { M: '2026-06-08' },
};

describe('setCampConfig', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
    invalidateCampConfigCacheMock.mockReset();
    // After write, read-back returns merged doc.
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...BASE, timezone: 'America/Denver' }),
    });
    mockUpdate.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
  });

  it('writes partial to config/camp and invalidates cache', async () => {
    const result = await setCampConfig({ timezone: 'America/Denver' });
    // Either set({...}, {merge:true}) or update({...}) is acceptable; we
    // only require that one of them was called with the partial.
    const setOrUpdateCalled =
      mockUpdate.mock.calls.length > 0 || mockSet.mock.calls.length > 0;
    expect(setOrUpdateCalled).toBe(true);
    const payload = mockUpdate.mock.calls[0]?.[0] ?? mockSet.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ timezone: 'America/Denver' });
    expect(invalidateCampConfigCacheMock).toHaveBeenCalledTimes(1);
    expect(result.timezone).toBe('America/Denver');
  });
});

describe('rotateCampCode', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
    invalidateCampConfigCacheMock.mockReset();
    mockGet.mockResolvedValue({ exists: true, data: () => BASE });
    mockUpdate.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
  });

  it('returns an 8-char code in the unambiguous charset', async () => {
    const code = await rotateCampCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    // Must exclude ambiguous chars.
    expect(code).not.toMatch(/[O0I1L]/);
  });

  it('writes the new code to config/camp and invalidates cache', async () => {
    const code = await rotateCampCode();
    const payload = mockUpdate.mock.calls[0]?.[0] ?? mockSet.mock.calls[0]?.[0];
    expect(payload).toHaveProperty('camp_code', code);
    expect(invalidateCampConfigCacheMock).toHaveBeenCalledTimes(1);
  });

  it('produces different codes across calls (probabilistic)', async () => {
    const a = await rotateCampCode();
    const b = await rotateCampCode();
    expect(a).not.toBe(b);
  });
});
