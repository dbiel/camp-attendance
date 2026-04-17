import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { rotateCampCodeMock, setCampCodeMock, verifyIdTokenMock } = vi.hoisted(() => ({
  rotateCampCodeMock: vi.fn(),
  setCampCodeMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  rotateCampCode: rotateCampCodeMock,
  setCampCode: setCampCodeMock,
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

function req(
  headers: Record<string, string> = { Authorization: 'Bearer fake' },
  body?: unknown
) {
  return new NextRequest('http://localhost/api/config/camp-code/rotate', {
    method: 'POST',
    headers: new Headers({
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/config/camp-code/rotate', () => {
  beforeEach(() => {
    rotateCampCodeMock.mockReset();
    setCampCodeMock.mockReset();
    // Default: produce a plausible rotated code each call.
    rotateCampCodeMock.mockImplementation(async () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let out = '';
      for (let i = 0; i < 8; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    });
    // Default: setCampCode echoes back whatever was passed in.
    setCampCodeMock.mockImplementation(async (code: string) => code);
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

  it('empty body still falls through to the random rotate path', async () => {
    // No body + no Content-Type. Handler should treat as empty and rotate.
    const r = new NextRequest('http://localhost/api/config/camp-code/rotate', {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer fake' }),
    });
    const res = await POST(r, CTX);
    expect(res.status).toBe(200);
    expect(rotateCampCodeMock).toHaveBeenCalledTimes(1);
    expect(setCampCodeMock).not.toHaveBeenCalled();
  });

  describe('with user-provided camp_code', () => {
    it('saves the provided code and returns it', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'ttuboc2026' }),
        CTX
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.camp_code).toBe('ttuboc2026');
      expect(setCampCodeMock).toHaveBeenCalledWith('ttuboc2026');
      expect(rotateCampCodeMock).not.toHaveBeenCalled();
    });

    it('accepts mixed-case alphanumeric (stored as-is)', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'TTUboc2026' }),
        CTX
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.camp_code).toBe('TTUboc2026');
      expect(setCampCodeMock).toHaveBeenCalledWith('TTUboc2026');
    });

    it('accepts min-length (4) code', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'abcd' }),
        CTX
      );
      expect(res.status).toBe(200);
      expect(setCampCodeMock).toHaveBeenCalledWith('abcd');
    });

    it('accepts max-length (32) code', async () => {
      const code = 'a'.repeat(32);
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: code }),
        CTX
      );
      expect(res.status).toBe(200);
      expect(setCampCodeMock).toHaveBeenCalledWith(code);
    });

    it('rejects too-short code (< 4 chars) with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'abc' }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
      expect(rotateCampCodeMock).not.toHaveBeenCalled();
    });

    it('rejects too-long code (> 32 chars) with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'a'.repeat(33) }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
    });

    it('rejects code with spaces with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'ttu boc 2026' }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
    });

    it('rejects code with special chars with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 'ttu-boc!' }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
    });

    it('rejects whitespace-only code with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: '      ' }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
    });

    it('rejects empty-string camp_code with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: '' }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
    });

    it('rejects non-string camp_code with 400', async () => {
      const res = await POST(
        req({ Authorization: 'Bearer fake' }, { camp_code: 12345 }),
        CTX
      );
      expect(res.status).toBe(400);
      expect(setCampCodeMock).not.toHaveBeenCalled();
    });
  });
});
