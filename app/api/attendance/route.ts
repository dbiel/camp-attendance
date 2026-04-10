import { NextRequest, NextResponse } from 'next/server';
import { markAttendance, getSessionAttendance } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const date = searchParams.get('date');

    if (!sessionId || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters: session_id, date' },
        { status: 400 }
      );
    }

    const attendance = await getSessionAttendance(sessionId, date);

    // Teachers only see non-PII fields
    if (role === 'teacher') {
      const sanitized = attendance.map(a => ({
        id: a.id,
        student_id: a.student_id,
        session_id: a.session_id,
        date: a.date,
        status: a.status,
        marked_at: a.marked_at,
      }));
      return NextResponse.json(sanitized);
    }

    return NextResponse.json(attendance);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { student_id, session_id, date, status, marked_by } = await request.json();

    if (!student_id || !session_id || !date || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await markAttendance(String(student_id), String(session_id), date, status, marked_by ? String(marked_by) : undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return NextResponse.json({ error: 'Failed to mark attendance' }, { status: 500 });
  }
}
