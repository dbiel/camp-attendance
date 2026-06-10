import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { addCaseEvent, getCase, CaseEventType } from '@/lib/cases';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED: CaseEventType[] = ['parent_texted', 'dorm_staff_texted', 'note'];

export const POST = withAuth<{ id: string }>(
  'super_admin',
  async (request, { params }) => {
    const body = await request.json().catch(() => null);
    const { type, body: text } = (body ?? {}) as Record<string, unknown>;
    if (typeof type !== 'string' || !ALLOWED.includes(type as CaseEventType) || typeof text !== 'string') {
      return NextResponse.json({ error: `type must be one of ${ALLOWED.join(', ')}; body required` }, { status: 400 });
    }
    if (!(await getCase(params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const caller = await verifyAdmin(request);
    const id = await addCaseEvent(params.id, type as CaseEventType, text, caller?.email || 'unknown');
    return NextResponse.json({ id });
  },
  { rateLimitKey: 'cases' }
);
