import { NextRequest, NextResponse } from 'next/server';
import { addStudentToSession } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { enrollments } = await request.json();

    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      return NextResponse.json(
        { error: 'Invalid data format' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const enrollment of enrollments) {
      try {
        await addStudentToSession(String(enrollment.session_id), String(enrollment.student_id));
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${enrollments.indexOf(enrollment) + 1}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error importing enrollments:', error);
    return NextResponse.json({ error: 'Failed to import enrollments' }, { status: 500 });
  }
}
