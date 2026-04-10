import { NextRequest, NextResponse } from 'next/server';
import { getStudentSchedule } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`students-schedule:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const schedule = await getStudentSchedule(params.id, date || undefined);
    return NextResponse.json(schedule);
  } catch (error) {
    console.error('Error fetching student schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
