import { NextRequest, NextResponse } from 'next/server';
import { getAttendanceReport } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  'admin',
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Missing required parameter: date' }, { status: 400 });
    }

    const report = await getAttendanceReport(date);
    return NextResponse.json(report);
  },
  { rateLimitKey: 'attendance-report' }
);
