import { NextRequest, NextResponse } from 'next/server';
import { getFacultySessions } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
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
