import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { verifyAdmin } from '@/lib/auth';
import { getTodayDate } from '@/lib/date';
import {
  createMarkedAbsence,
  listMarkedAbsences,
  listUpcomingMarkedAbsences,
  validateWindow,
  validDate,
} from '@/lib/marked-absences';

export const dynamic = 'force-dynamic';

export const POST = withAuth('lookup_admin', async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const { student_id, student_name, from, until, note, date, all_day } = (body ?? {}) as Record<string, unknown>;
  const theDate = typeof date === 'string' && date ? date : getTodayDate();
  const allDay = all_day === true;
  if (
    typeof student_id !== 'string' || !student_id ||
    typeof student_name !== 'string' || !student_name ||
    !validDate(theDate) ||
    (!allDay && (typeof from !== 'string' || typeof until !== 'string' || !validateWindow(from, until)))
  ) {
    return NextResponse.json({ error: 'student, a valid date, and (for a timed absence) a from < until window are required' }, { status: 400 });
  }
  const caller = await verifyAdmin(request);
  const id = await createMarkedAbsence({
    student_id,
    student_name,
    date: theDate,
    all_day: allDay,
    from: typeof from === 'string' ? from : undefined,
    until: typeof until === 'string' ? until : undefined,
    note: typeof note === 'string' ? note : null,
    created_by: caller?.email || 'unknown',
  });
  return NextResponse.json({ id });
});

export const GET = withAuth('lookup_admin', async (request: NextRequest) => {
  const date = new URL(request.url).searchParams.get('date');
  const absences = date ? await listMarkedAbsences(date) : await listUpcomingMarkedAbsences();
  return NextResponse.json({ absences });
});
