import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { rotateCampCode, setCampCode } from '@/lib/firestore';

export const dynamic = 'force-dynamic';

// Admin-supplied codes: alphanumeric only (mixed case allowed). The
// stored value is compared timing-safe at teacher-auth time so the
// charset here is purely a UX guardrail against accidental whitespace
// or symbols that would be hard to type.
const CAMP_CODE_USER_REGEX = /^[A-Za-z0-9]+$/;
const CAMP_CODE_MIN_LENGTH = 4;
const CAMP_CODE_MAX_LENGTH = 32;

/**
 * POST /api/config/camp-code/rotate
 *
 * Admin-only. Two modes:
 *
 *   1. Empty body (or no `camp_code` field) — generates a new 8-char
 *      crypto-random code from an unambiguous uppercase-alphanumeric
 *      charset (no 0/O/1/I/L).
 *   2. Body `{ camp_code: string }` — writes the admin-supplied code
 *      verbatim (case preserved) so a memorable phrase can be used.
 *      Validation: 4–32 chars, letters + digits only.
 *
 * In both cases the new code is written to `config/camp`, the server
 * cache is invalidated, and the new code is echoed back. Every existing
 * teacher client must re-enter the new code after this call — there is
 * no grace period or dual-code support.
 */
export const POST = withAuth(
  'admin',
  async (request: NextRequest) => {
    // Parse body, tolerate empty / non-JSON by falling through to rotate.
    let body: unknown = null;
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const hasCampCodeField =
      body !== null &&
      typeof body === 'object' &&
      Object.prototype.hasOwnProperty.call(body, 'camp_code');

    try {
      if (hasCampCodeField) {
        const raw = (body as { camp_code: unknown }).camp_code;
        if (typeof raw !== 'string') {
          return NextResponse.json(
            { error: 'camp_code must be a string' },
            { status: 400 }
          );
        }
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          return NextResponse.json(
            { error: 'camp_code cannot be empty' },
            { status: 400 }
          );
        }
        if (
          trimmed.length < CAMP_CODE_MIN_LENGTH ||
          trimmed.length > CAMP_CODE_MAX_LENGTH
        ) {
          return NextResponse.json(
            {
              error: `camp_code must be ${CAMP_CODE_MIN_LENGTH}–${CAMP_CODE_MAX_LENGTH} characters`,
            },
            { status: 400 }
          );
        }
        if (!CAMP_CODE_USER_REGEX.test(trimmed)) {
          return NextResponse.json(
            { error: 'camp_code may only contain letters and digits' },
            { status: 400 }
          );
        }
        const code = await setCampCode(trimmed);
        return NextResponse.json({ camp_code: code });
      }

      const code = await rotateCampCode();
      return NextResponse.json({ camp_code: code });
    } catch (error) {
      console.error('[POST /api/config/camp-code/rotate] failed:', error);
      return NextResponse.json(
        { error: 'Failed to update camp code' },
        { status: 500 }
      );
    }
  },
  { rateLimitKey: 'camp-code-rotate' }
);
