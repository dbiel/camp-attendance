import { NextRequest, NextResponse } from 'next/server';
import { getDailyStats, getTodayDate } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`stats:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayDate();

    const stats = await getDailyStats(date);

    return NextResponse.json({
      date,
      present: stats.present || 0,
      absent: stats.absent || 0,
      tardy: stats.tardy || 0,
      unmarked: stats.unmarked || 0,
      total: stats.total || 0,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
