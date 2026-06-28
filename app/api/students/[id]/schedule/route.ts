import { NextResponse } from 'next/server';
import { getStudentSchedule, getStudentScheduleSessions } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(
  'lookup_admin',
  async (request, { params }) => {
    const { searchParams } = new URL(request.url);
    // ?format=slots → lean per-period slots (incl. faculty) for the now/next
    // resolver + expandable schedule. Default keeps the legacy attendance-joined
    // schedule used elsewhere.
    if (searchParams.get('format') === 'slots') {
      const slots = await getStudentScheduleSessions(params.id);
      return NextResponse.json({ slots });
    }
    const date = searchParams.get('date');
    const schedule = await getStudentSchedule(params.id, date || undefined);
    return NextResponse.json(schedule);
  },
  { rateLimitKey: 'students-schedule' }
);
