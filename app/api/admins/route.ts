import { NextRequest, NextResponse } from 'next/server';
import { addAdmin, listAdmins } from '@/lib/firestore';
import { createPasswordAdmin } from '@/lib/admin-users';
import { verifyAdmin } from '@/lib/auth';
import { withAuth } from '@/lib/with-auth';
import type { AdminRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRole(raw: unknown): AdminRole {
  return raw === 'super_admin' ? 'super_admin' : 'lookup_admin';
}

export const GET = withAuth(
  'super_admin',
  async () => {
    const admins = await listAdmins();
    return NextResponse.json({ admins });
  },
  { rateLimitKey: 'admins' }
);

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const role = parseRole(b.role);
    const authType = b.auth_type === 'password' ? 'password' : 'google';

    const caller = await verifyAdmin(request);
    const addedBy = caller?.email || caller?.uid || 'unknown';

    try {
      // ── Password account (person has no Google login) ──────────────────
      if (authType === 'password') {
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        if (!name) {
          return NextResponse.json({ error: 'name required for password accounts' }, { status: 400 });
        }
        const mode = b.mode === 'temp_password' ? 'temp_password' : 'setup_link';
        const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : undefined;
        if (email && !EMAIL_REGEX.test(email)) {
          return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
        }
        const result = await createPasswordAdmin({
          email,
          name,
          role,
          mode,
          password: typeof b.password === 'string' ? b.password : undefined,
          addedBy,
        });
        return NextResponse.json({ ...result, role, auth_type: 'password' }, { status: 200 });
      }

      // ── Google account (just allowlist the email) ──────────────────────
      const rawEmail = b.email;
      if (typeof rawEmail !== 'string') {
        return NextResponse.json({ error: 'email required' }, { status: 400 });
      }
      const email = rawEmail.trim().toLowerCase();
      if (!EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      }
      await addAdmin(email, addedBy, role);
      return NextResponse.json(
        { email, role, auth_type: 'google', added_by: addedBy, added_at: Date.now() },
        { status: 200 }
      );
    } catch (err) {
      const msg = (err as Error).message || 'Failed to add admin';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  },
  { rateLimitKey: 'admins' }
);
