import { NextRequest, NextResponse } from 'next/server';
import { getSessionStudentsFull, getSessionStudents } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Teachers get denormalized non-PII data, admins get full student records
    if (role === 'teacher') {
      const students = await getSessionStudents(params.id);
      return NextResponse.json(students);
    }

    const students = await getSessionStudentsFull(params.id);
    return NextResponse.json(students);
  } catch (error) {
    console.error('Error fetching session students:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}
