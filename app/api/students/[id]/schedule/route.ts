import { NextResponse } from 'next/server';
import { getStudentSchedule } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(
  'lookup_admin',
  async (request, { params }) => {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const schedule = await getStudentSchedule(params.id, date || undefined);
    return NextResponse.json(schedule);
  },
  { rateLimitKey: 'students-schedule' }
);
