/**
 * Auth Unit Tests
 *
 * Tests verifyAdmin, verifyTeacher, getCallerRole with mocked Firebase Admin SDK.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock firebase-admin before importing auth
vi.mock('@/lib/firebase-admin', () => {
  return {
    adminAuth: {
      verifyIdToken: vi.fn(),
    },
    adminDb: {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(),
        })),
      })),
    },
  };
});

// Mock the admin allowlist helpers. verifyAdmin calls these after decoding
// the token — we stub them so these tests stay focused on token handling.
vi.mock('@/lib/firestore', () => ({
  isAdminEmail: vi.fn(),
  bootstrapAdminIfEmpty: vi.fn(),
}));

import { verifyAdmin, verifyTeacher, getCallerRole } from '@/lib/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { isAdminEmail, bootstrapAdminIfEmpty } from '@/lib/firestore';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return new NextRequest('http://localhost:3000/api/test', { headers: h });
}

describe('verifyAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminEmail).mockResolvedValue(true);
    vi.mocked(bootstrapAdminIfEmpty).mockResolvedValue(false);
  });

  it('returns decoded token for valid Bearer token on allowlist', async () => {
    const decoded = { uid: 'admin-123', email: 'admin@test.com' };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(decoded as any);

    const result = await verifyAdmin(makeRequest({ Authorization: 'Bearer valid-token' }));
    expect(result).toEqual(decoded);
    expect(adminAuth.verifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(isAdminEmail).toHaveBeenCalledWith('admin@test.com');
  });

  it('returns null when no Authorization header', async () => {
    const result = await verifyAdmin(makeRequest());
    expect(result).toBeNull();
  });

  it('returns null when Authorization header is not Bearer', async () => {
    const result = await verifyAdmin(makeRequest({ Authorization: 'Basic user:pass' }));
    expect(result).toBeNull();
  });

  it('returns null when token verification fails', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('Invalid token'));

    const result = await verifyAdmin(makeRequest({ Authorization: 'Bearer bad-token' }));
    expect(result).toBeNull();
  });

  it('returns null when token is valid but email is not on allowlist', async () => {
    const decoded = { uid: 'nope-1', email: 'mallory@test.com' };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(decoded as any);
    vi.mocked(isAdminEmail).mockResolvedValue(false);
    vi.mocked(bootstrapAdminIfEmpty).mockResolvedValue(false);

    const result = await verifyAdmin(makeRequest({ Authorization: 'Bearer valid-token' }));
    expect(result).toBeNull();
  });

  it('returns decoded token when bootstrap seeding succeeds', async () => {
    const decoded = { uid: 'first-1', email: 'firstadmin@test.com' };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(decoded as any);
    // New flow: verifyAdmin calls bootstrapAdminIfEmpty FIRST, then
    // isAdminEmail. A real bootstrap write would make isAdminEmail return
    // true on the subsequent doc lookup — simulate that here.
    vi.mocked(bootstrapAdminIfEmpty).mockResolvedValue(true);
    vi.mocked(isAdminEmail).mockResolvedValue(true);

    const result = await verifyAdmin(makeRequest({ Authorization: 'Bearer valid-token' }));
    expect(result).toEqual(decoded);
    expect(bootstrapAdminIfEmpty).toHaveBeenCalledWith('firstadmin@test.com');
  });

  it('calls bootstrapAdminIfEmpty BEFORE isAdminEmail so seed writes persist', async () => {
    // Regression guard: the old flow short-circuited past bootstrapAdminIfEmpty
    // whenever isAdminEmail returned true, which happened on the bootstrap
    // branch without writing. This asserts the correct call order.
    const decoded = { uid: 'order-1', email: 'admin@test.com' };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(decoded as any);
    vi.mocked(isAdminEmail).mockResolvedValue(true);
    vi.mocked(bootstrapAdminIfEmpty).mockResolvedValue(false);

    await verifyAdmin(makeRequest({ Authorization: 'Bearer valid-token' }));

    const bootstrapOrder = vi.mocked(bootstrapAdminIfEmpty).mock.invocationCallOrder[0];
    const isAdminOrder = vi.mocked(isAdminEmail).mock.invocationCallOrder[0];
    expect(bootstrapOrder).toBeLessThan(isAdminOrder);
  });

  it('returns null when token has no email claim', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'x' } as any);

    const result = await verifyAdmin(makeRequest({ Authorization: 'Bearer valid-token' }));
    expect(result).toBeNull();
    expect(isAdminEmail).not.toHaveBeenCalled();
  });
});

describe('verifyTeacher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMP_CODE = 'test-camp-2026';
  });

  it('returns true for valid camp code (from Firestore)', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'test-camp-2026' }));
    expect(result).toBe(true);
  });

  it('returns false when no X-Camp-Code header', async () => {
    const result = await verifyTeacher(makeRequest());
    expect(result).toBe(false);
  });

  it('returns false for wrong camp code', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'wrong-code' }));
    expect(result).toBe(false);
  });

  it('falls back to env var when config doc not found', async () => {
    const mockGet = vi.fn().mockResolvedValue({ exists: false });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'test-camp-2026' }));
    expect(result).toBe(true);
  });

  it('falls back to env var when Firestore is unreachable', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'test-camp-2026' }));
    expect(result).toBe(true);
  });

  it('returns false (no throw) when provided code is shorter than expected', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': 'x' }));
    expect(result).toBe(false);
  });

  it('returns false (no throw) when provided code is longer than expected', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await verifyTeacher(
      makeRequest({ 'X-Camp-Code': 'test-camp-2026-extra-junk' })
    );
    expect(result).toBe(false);
  });

  it('does not throw on pathological inputs (empty, unicode, huge)', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    for (const bad of ['', 'a', 'a'.repeat(10_000)]) {
      const result = await verifyTeacher(makeRequest({ 'X-Camp-Code': bad }));
      expect(result).toBe(false);
    }
  });
});

describe('getCallerRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMP_CODE = 'test-camp-2026';
    vi.mocked(isAdminEmail).mockResolvedValue(true);
    vi.mocked(bootstrapAdminIfEmpty).mockResolvedValue(false);
  });

  it('returns "admin" when valid Bearer token present', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin-123', email: 'a@b.com' } as any);

    const result = await getCallerRole(makeRequest({ Authorization: 'Bearer valid-token' }));
    expect(result).toBe('admin');
  });

  it('returns "teacher" when valid camp code present (no Bearer)', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('No token'));

    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await getCallerRole(makeRequest({ 'X-Camp-Code': 'test-camp-2026' }));
    expect(result).toBe('teacher');
  });

  it('returns null when no valid auth', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('No token'));

    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await getCallerRole(makeRequest());
    expect(result).toBeNull();
  });

  it('admin takes precedence when both auth types present', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin-123', email: 'a@b.com' } as any);

    const result = await getCallerRole(
      makeRequest({ Authorization: 'Bearer valid', 'X-Camp-Code': 'test-camp-2026' })
    );
    expect(result).toBe('admin');
  });

  it('returns "teacher" when Bearer token present but email not on allowlist (and camp code valid)', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'x', email: 'mallory@test.com' } as any);
    vi.mocked(isAdminEmail).mockResolvedValue(false);
    vi.mocked(bootstrapAdminIfEmpty).mockResolvedValue(false);

    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ camp_code: 'test-camp-2026' }),
    });
    vi.mocked(adminDb.collection).mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
    } as any);

    const result = await getCallerRole(
      makeRequest({ Authorization: 'Bearer valid', 'X-Camp-Code': 'test-camp-2026' })
    );
    expect(result).toBe('teacher');
  });
});
