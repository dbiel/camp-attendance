import { NextRequest, NextResponse } from 'next/server';
import { getFacultySessions } from '@/lib/firestore';
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
      if (!checkRateLimit(`faculty-sessions:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const sessions = await getFacultySessions(params.id, date || undefined);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching faculty sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
