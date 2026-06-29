import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { verifyAdmin } from '@/lib/auth';
import { getTodayDate } from '@/lib/date';
import { createMarkedAbsence, listMarkedAbsences, validateWindow } from '@/lib/marked-absences';

export const dynamic = 'force-dynamic';

export const POST = withAuth('lookup_admin', async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const { student_id, student_name, from, until, note } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof student_id !== 'string' || !student_id ||
    typeof student_name !== 'string' || !student_name ||
    typeof from !== 'string' || typeof until !== 'string' || !validateWindow(from, until)
  ) {
    return NextResponse.json({ error: 'student and a valid from < until window are required' }, { status: 400 });
  }
  const caller = await verifyAdmin(request);
  const id = await createMarkedAbsence({
    student_id,
    student_name,
    from,
    until,
    note: typeof note === 'string' ? note : null,
    created_by: caller?.email || 'unknown',
  });
  return NextResponse.json({ id });
});

export const GET = withAuth('lookup_admin', async (request: NextRequest) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || getTodayDate();
  const absences = await listMarkedAbsences(date);
  return NextResponse.json({ absences });
});
