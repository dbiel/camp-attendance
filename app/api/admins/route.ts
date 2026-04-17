import { NextRequest, NextResponse } from 'next/server';
import { addAdmin, listAdmins } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = withAuth(
  'admin',
  async () => {
    const admins = await listAdmins();
    return NextResponse.json({ admins });
  },
  { rateLimitKey: 'admins' }
);

export const POST = withAuth(
  'admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const rawEmail = (body as { email?: unknown }).email;
    if (typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    // Who is adding — use the verified caller's email, fall back to uid.
    const caller = await verifyAdmin(request);
    const addedBy = caller?.email || caller?.uid || 'unknown';

    try {
      await addAdmin(email, addedBy);
    } catch (err) {
      const msg = (err as Error).message || 'Failed to add admin';
      // Both "Invalid email" and "Admin already exists" are client-fixable.
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json(
      {
        email,
        added_by: addedBy,
        added_at: Date.now(),
      },
      { status: 200 }
    );
  },
  { rateLimitKey: 'admins' }
);
