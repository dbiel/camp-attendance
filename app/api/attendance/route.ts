import { NextRequest, NextResponse } from 'next/server';
import {
  markAttendance,
  getSessionAttendance,
  isFacultyAssignedToSession,
} from '@/lib/firestore';
import { verifyAdmin, verifyTeacher } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = new Set(['present', 'absent', 'tardy'] as const);
type AttendanceStatus = 'present' | 'absent' | 'tardy';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    const isTeacher = admin ? false : await verifyTeacher(request);
    if (!admin && !isTeacher) {
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

    // Teacher scoping: must present X-Faculty-Id and be assigned to the session.
    if (!admin) {
      const facultyId = request.headers.get('X-Faculty-Id');
      if (!facultyId) {
        return NextResponse.json({ error: 'Missing X-Faculty-Id' }, { status: 403 });
      }
      const assigned = await isFacultyAssignedToSession(facultyId, sessionId);
      if (!assigned) {
        return NextResponse.json(
          { error: 'Not assigned to this session' },
          { status: 403 }
        );
      }
    }

    const attendance = await getSessionAttendance(sessionId, date);

    // Teachers only see non-PII fields
    if (!admin) {
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
    const admin = await verifyAdmin(request);
    const isTeacher = admin ? false : await verifyTeacher(request);
    if (!admin && !isTeacher) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { student_id, session_id, date, status } = body as Record<string, unknown>;

    if (!student_id || !session_id || !date || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status as AttendanceStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Derive marked_by from verified identity; ignore any client-supplied value.
    const markedBy = admin
      ? `admin:${admin.uid}`
      : `teacher:${getClientIp(request)}`;

    await markAttendance(
      String(student_id),
      String(session_id),
      String(date),
      status as AttendanceStatus,
      markedBy
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return NextResponse.json({ error: 'Failed to mark attendance' }, { status: 500 });
  }
}
