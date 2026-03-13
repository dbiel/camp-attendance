import { NextRequest, NextResponse } from 'next/server';
import { getFaculty, createFaculty } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export async function GET() {
  try {
    // Faculty list is publicly readable (teacher landing page)
    const faculty = await getFaculty();
    return NextResponse.json(faculty);
  } catch (error) {
    console.error('Error fetching faculty:', error);
    return NextResponse.json({ error: 'Failed to fetch faculty' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const data = await request.json();
    const id = await createFaculty(data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Error creating faculty:', error);
    return NextResponse.json({ error: 'Failed to create faculty' }, { status: 500 });
  }
}
