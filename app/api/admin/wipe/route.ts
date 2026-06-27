import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { wipeAllCampData, WIPE_COLLECTIONS } from '@/lib/wipe';

export const dynamic = 'force-dynamic';
// session_students can be ~12k docs; give the streamed delete room.
export const maxDuration = 300;

/**
 * POST /api/admin/wipe — Clear All Data (super_admin only).
 *
 * Requires `{ confirm: "RESET" }` in the body; the typed confirmation is
 * re-validated SERVER-SIDE (the UI gate is not the boundary). Wipes only the
 * hard-coded WIPE_COLLECTIONS list — never a request-supplied set. No CSRF
 * concern: auth is a Bearer header, not a cookie.
 */
export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || (body as { confirm?: unknown }).confirm !== 'RESET') {
      return NextResponse.json(
        { error: 'Confirmation failed — type RESET to confirm.' },
        { status: 400 }
      );
    }
    const results = await wipeAllCampData();
    return NextResponse.json({
      ok: true,
      cleared: results.map((r) => r.collection),
      collections: WIPE_COLLECTIONS,
    });
  },
  { rateLimitKey: 'admin-wipe' }
);
