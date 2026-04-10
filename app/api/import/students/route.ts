import { NextRequest, NextResponse } from 'next/server';
import { createStudent } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`import-students:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { students } = await request.json();

    if (!Array.isArray(students) || students.length === 0) {
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

    for (const student of students) {
      try {
        await createStudent({
          first_name: student.first_name,
          last_name: student.last_name,
          preferred_name: student.preferred_name,
          gender: student.gender,
          division: student.division || 'Commuter',
          instrument: student.instrument,
          ensemble: student.ensemble,
          chair_number: student.chair_number ? parseInt(student.chair_number) : undefined,
          dorm_building: student.dorm_building,
          dorm_room: student.dorm_room,
          email: student.email,
          cell_phone: student.cell_phone,
          parent_first_name: student.parent_first_name,
          parent_last_name: student.parent_last_name,
          parent_phone: student.parent_phone,
          medical_notes: student.medical_notes,
          additional_info: student.additional_info,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${students.indexOf(student) + 1}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error importing students:', error);
    return NextResponse.json({ error: 'Failed to import students' }, { status: 500 });
  }
}
