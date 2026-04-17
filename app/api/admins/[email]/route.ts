import { NextRequest, NextResponse } from 'next/server';
import { removeAdmin } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admins/[email]
 *
 * Admin-only. Removes the given email from the allowlist. The route param
 * arrives URL-encoded — Next.js decodes it automatically. We then lowercase
 * + compare against the caller's own email to block self-removal, which
 * would be a footgun (an admin locking themselves out of Settings).
 */
export const DELETE = withAuth<{ email: string }>(
  'admin',
  async (request: NextRequest, { params }) => {
    const targetEmail = (params.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }

    // Decode the caller's token to compare emails. `withAuth` already
    // guarantees admin role; re-decoding is cheap and keeps the wrapper
    // signature unchanged.
    const caller = await verifyAdmin(request);
    const callerEmail = caller?.email?.toLowerCase();
    if (callerEmail && callerEmail === targetEmail) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }

    await removeAdmin(targetEmail);
    return NextResponse.json({ success: true });
  },
  { rateLimitKey: 'admins' }
);
