import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { listCases, createCase } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const status = request.nextUrl.searchParams.get('status') === 'resolved' ? 'resolved' : 'active';
    const cases = await listCases(status);
    return NextResponse.json({ cases });
  },
  { rateLimitKey: 'cases' }
);

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { student_id, summary, raw_text, reporter_contact_id, reporter_name, session_label } =
      body as Record<string, unknown>;
    if (typeof student_id !== 'string' || typeof summary !== 'string' || typeof raw_text !== 'string') {
      return NextResponse.json({ error: 'student_id, summary, raw_text required' }, { status: 400 });
    }
    const student = await getStudent(student_id);
    if (!student) return NextResponse.json({ error: 'Unknown student' }, { status: 400 });

    const caller = await verifyAdmin(request);
    const id = await createCase({
      student_id,
      student_name: `${student.first_name} ${student.last_name}`,
      summary,
      raw_text,
      reporter_contact_id: typeof reporter_contact_id === 'string' ? reporter_contact_id : null,
      reporter_name: typeof reporter_name === 'string' ? reporter_name : null,
      session_label: typeof session_label === 'string' ? session_label : null,
      created_by: caller?.email || 'unknown',
    });
    return NextResponse.json({ id });
  },
  { rateLimitKey: 'cases' }
);
