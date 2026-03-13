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

import { verifyAdmin, verifyTeacher, getCallerRole } from '@/lib/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return new NextRequest('http://localhost:3000/api/test', { headers: h });
}

describe('verifyAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns decoded token for valid Bearer token', async () => {
    const decoded = { uid: 'admin-123', email: 'admin@test.com' };
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(decoded as any);

    const result = await verifyAdmin(makeRequest({ Authorization: 'Bearer valid-token' }));
    expect(result).toEqual(decoded);
    expect(adminAuth.verifyIdToken).toHaveBeenCalledWith('valid-token');
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
});

describe('getCallerRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAMP_CODE = 'test-camp-2026';
  });

  it('returns "admin" when valid Bearer token present', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin-123' } as any);

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
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'admin-123' } as any);

    const result = await getCallerRole(
      makeRequest({ Authorization: 'Bearer valid', 'X-Camp-Code': 'test-camp-2026' })
    );
    expect(result).toBe('admin');
  });
});
