import { NextRequest, NextResponse } from 'next/server';
import { removeAdmin, setAdminRole, getAdminRole, countSuperAdmins } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';
import { withAuth } from '@/lib/with-auth';
import type { AdminRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admins/[email] — super-admin-only. Removes the email from the
 * allowlist. Blocks self-removal and removing the last remaining super_admin
 * (either would lock everyone out of admin management). The auth user record,
 * if any, is left in place — without an allowlist entry it grants no access.
 */
export const DELETE = withAuth<{ email: string }>(
  'super_admin',
  async (request: NextRequest, { params }) => {
    const targetEmail = (params.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }

    const caller = await verifyAdmin(request);
    const callerEmail = caller?.email?.toLowerCase();
    if (callerEmail && callerEmail === targetEmail) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }

    if ((await getAdminRole(targetEmail)) === 'super_admin' && (await countSuperAdmins()) <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last super admin' }, { status: 400 });
    }

    await removeAdmin(targetEmail);
    return NextResponse.json({ success: true });
  },
  { rateLimitKey: 'admins' }
);

/**
 * PATCH /api/admins/[email] — super-admin-only. Changes an admin's role.
 * Blocks demoting the last super_admin (which would strand admin management).
 */
export const PATCH = withAuth<{ email: string }>(
  'super_admin',
  async (request: NextRequest, { params }) => {
    const targetEmail = (params.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    const rawRole = (body as { role?: unknown } | null)?.role;
    if (rawRole !== 'super_admin' && rawRole !== 'lookup_admin') {
      return NextResponse.json({ error: 'role must be super_admin or lookup_admin' }, { status: 400 });
    }
    const role = rawRole as AdminRole;

    // Block demoting the last super admin.
    if (
      role === 'lookup_admin' &&
      (await getAdminRole(targetEmail)) === 'super_admin' &&
      (await countSuperAdmins()) <= 1
    ) {
      return NextResponse.json({ error: 'Cannot demote the last super admin' }, { status: 400 });
    }

    try {
      await setAdminRole(targetEmail, role);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    return NextResponse.json({ email: targetEmail, role });
  },
  { rateLimitKey: 'admins' }
);
