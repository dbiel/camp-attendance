import { NextRequest, NextResponse } from 'next/server';
import { resetAdminPassword } from '@/lib/admin-users';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admins/[email]/password — super-admin-only. Resets a password
 * account's credentials: `mode: 'temp_password'` sets a new password directly;
 * `mode: 'setup_link'` returns a fresh reset link to hand to the person.
 * Only valid for password accounts (Google accounts have no password here).
 */
export const POST = withAuth<{ email: string }>(
  'super_admin',
  async (request: NextRequest, { params }) => {
    const targetEmail = (params.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    const b = (body as Record<string, unknown> | null) ?? {};
    const mode = b.mode === 'temp_password' ? 'temp_password' : 'setup_link';
    const password = typeof b.password === 'string' ? b.password : undefined;

    try {
      const result = await resetAdminPassword(targetEmail, mode, password);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  },
  { rateLimitKey: 'admins' }
);
