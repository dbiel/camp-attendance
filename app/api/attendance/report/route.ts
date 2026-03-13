import { NextRequest, NextResponse } from 'next/server';
import { getAttendanceReport } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    const report = await getAttendanceReport(date, status as 'absent' | 'tardy' | undefined);
    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching attendance report:', error);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}
