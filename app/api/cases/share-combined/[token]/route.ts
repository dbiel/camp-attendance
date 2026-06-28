import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { revokeCombinedShareLink } from '@/lib/cases';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/cases/share-combined/<token> — revoke a combined staff link
 * immediately (before its TTL). super_admin only. Idempotent.
 */
export const DELETE = withAuth<{ token: string }>(
  'super_admin',
  async (_request, { params }) => {
    await revokeCombinedShareLink(params.token);
    return NextResponse.json({ ok: true });
  },
  { rateLimitKey: 'cases' }
);
