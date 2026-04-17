import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { rotateCampCodeMock, verifyIdTokenMock } = vi.hoisted(() => ({
  rotateCampCodeMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  rotateCampCode: rotateCampCodeMock,
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  },
}));

import { POST } from '@/app/api/config/camp-code/rotate/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

const CTX = { params: {} };

// Allowed charset (documented below): ABCDEFGHJKMNPQRSTUVWXYZ23456789
const ALLOWED_CHARSET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function req(headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/config/camp-code/rotate', {
    method: 'POST',
    headers: new Headers(headers),
  });
}

describe('POST /api/config/camp-code/rotate', () => {
  beforeEach(() => {
    rotateCampCodeMock.mockReset();
    // Default: produce a plausible rotated code each call.
    rotateCampCodeMock.mockImplementation(async () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let out = '';
      for (let i = 0; i < 8; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    });
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
    process.env.CAMP_CODE = 'teachercode';
  });

  it('returns 401 when no auth', async () => {
    const res = await POST(req({}), CTX);
    expect(res.status).toBe(401);
    expect(rotateCampCodeMock).not.toHaveBeenCalled();
  });

  it('returns 403 for teacher role', async () => {
    const res = await POST(req({ 'X-Camp-Code': 'teachercode' }), CTX);
    expect(res.status).toBe(403);
    expect(rotateCampCodeMock).not.toHaveBeenCalled();
  });

  it('returns 200 with { camp_code: <8-char string> } on success', async () => {
    const res = await POST(req(), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.camp_code).toBe('string');
    expect(body.camp_code).toHaveLength(8);
    expect(rotateCampCodeMock).toHaveBeenCalledTimes(1);
  });

  it('response camp_code matches allowed charset (no O/0/1/I/L)', async () => {
    // Mock returns a known value so we also assert the format is what the helper produced.
    rotateCampCodeMock.mockResolvedValueOnce('AB2CD3EF');
    const res = await POST(req(), CTX);
    const body = await res.json();
    expect(body.camp_code).toMatch(ALLOWED_CHARSET);
  });

  it('two consecutive calls return different codes (probabilistic)', async () => {
    const res1 = await POST(req(), CTX);
    const b1 = await res1.json();
    const res2 = await POST(req(), CTX);
    const b2 = await res2.json();
    expect(b1.camp_code).not.toBe(b2.camp_code);
  });
});
