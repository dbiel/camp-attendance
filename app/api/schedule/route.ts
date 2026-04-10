import { NextRequest, NextResponse } from 'next/server';
import { getScheduleGrid } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`schedule:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const schedule = await getScheduleGrid();
    return NextResponse.json(schedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
