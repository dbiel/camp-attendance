import { NextRequest, NextResponse } from 'next/server';
import { getStudents, createStudent } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

// Read + create are available to lookup admins (they look up and correct kid
// data). Deletion stays super-admin-only — see app/api/students/[id]/route.ts.
export const GET = withAuth(
  'lookup_admin',
  async () => {
    const students = await getStudents();
    return NextResponse.json(students);
  },
  { rateLimitKey: 'students' }
);

export const POST = withAuth(
  'lookup_admin',
  async (request: NextRequest) => {
    const data = await request.json();
    const id = await createStudent(data);
    return NextResponse.json({ id }, { status: 201 });
  },
  { rateLimitKey: 'students' }
);
