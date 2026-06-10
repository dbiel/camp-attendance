import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { listContacts, createContact, ContactRole } from '@/lib/contacts';

export const dynamic = 'force-dynamic';

const ROLES: ContactRole[] = ['faculty', 'dorm_staff', 'admin', 'other'];

export const GET = withAuth(
  'super_admin',
  async () => NextResponse.json({ contacts: await listContacts() }),
  { rateLimitKey: 'contacts' }
);

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const { name, role, phone, dorm_building, notes } = (body ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' ||
        typeof role !== 'string' || !ROLES.includes(role as ContactRole)) {
      return NextResponse.json({ error: 'name, phone, and valid role required' }, { status: 400 });
    }
    try {
      const id = await createContact({
        name, phone,
        role: role as ContactRole,
        dorm_building: typeof dorm_building === 'string' ? dorm_building : undefined,
        notes: typeof notes === 'string' ? notes : undefined,
      });
      return NextResponse.json({ id });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  },
  { rateLimitKey: 'contacts' }
);
