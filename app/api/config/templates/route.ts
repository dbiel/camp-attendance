import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getMessageTemplates, setMessageTemplates } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  'super_admin',
  async () => NextResponse.json({ templates: await getMessageTemplates() }),
  { rateLimitKey: 'templates' }
);

export const PUT = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const { parent, dorm_staff } = (body ?? {}) as Record<string, unknown>;
    const partial: Record<string, string> = {};
    if (typeof parent === 'string') partial.parent = parent;
    if (typeof dorm_staff === 'string') partial.dorm_staff = dorm_staff;
    if (Object.keys(partial).length === 0) {
      return NextResponse.json({ error: 'parent or dorm_staff required' }, { status: 400 });
    }
    return NextResponse.json({ templates: await setMessageTemplates(partial) });
  },
  { rateLimitKey: 'templates' }
);
