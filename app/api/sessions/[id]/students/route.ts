import { NextRequest, NextResponse } from 'next/server';
import { getSessionStudentsFull, getSessionStudents } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sessionStudentsForTeacher } from '@/lib/projections';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`sessions-students:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Teachers get a dorm-room-stripped projection; admins get full records.
    if (role === 'teacher') {
      const students = await getSessionStudents(params.id);
      return NextResponse.json(sessionStudentsForTeacher(students));
    }

    const students = await getSessionStudentsFull(params.id);
    return NextResponse.json(students);
  } catch (error) {
    console.error('Error fetching session students:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}
