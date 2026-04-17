import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { rotateCampCode } from '@/lib/firestore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/config/camp-code/rotate
 *
 * Admin-only. Generates a new 8-char crypto-random camp code from an
 * unambiguous uppercase-alphanumeric charset (no 0/O/1/I/L), writes it
 * to `config/camp`, invalidates the server-side cache, and returns the
 * new code.
 *
 * Security note: after rotation every existing teacher client must
 * re-enter the new code. There is no grace period or dual-code support.
 */
export const POST = withAuth(
  'admin',
  async (_request: NextRequest) => {
    try {
      const code = await rotateCampCode();
      return NextResponse.json({ camp_code: code });
    } catch (error) {
      console.error('[POST /api/config/camp-code/rotate] failed:', error);
      return NextResponse.json(
        { error: 'Failed to rotate camp code' },
        { status: 500 }
      );
    }
  },
  { rateLimitKey: 'camp-code-rotate' }
);
