import { NextRequest, NextResponse } from 'next/server';
import { createFaculty } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { faculty } = await request.json();

    if (!Array.isArray(faculty) || faculty.length === 0) {
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

    for (const member of faculty) {
      try {
        await createFaculty({
          first_name: member.first_name,
          last_name: member.last_name,
          role: member.role,
          email: member.email,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${faculty.indexOf(member) + 1}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error importing faculty:', error);
    return NextResponse.json({ error: 'Failed to import faculty' }, { status: 500 });
  }
}
