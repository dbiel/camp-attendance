import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me — the client's role source.
 *
 * `withAuth('lookup_admin')` accepts both super_admin and lookup_admin and
 * hands the resolved tier to the handler: `'admin'` for a super admin,
 * `'lookup_admin'` otherwise. The client uses this purely to render the right
 * chrome (e.g. hide the Inbox tab / Clear-All-Data from lookup admins).
 *
 * SECURITY: this is COSMETIC only. The real access boundary is server-side
 * enforcement on every privileged route (e.g. `/api/texts`, `/api/admin/wipe`
 * are `super_admin`). Tab-hiding must never be treated as access control.
 */
export const GET = withAuth(
  'lookup_admin',
  async (_request, { role }) => {
    return NextResponse.json({ role });
  },
  { rateLimitKey: 'me' }
);
