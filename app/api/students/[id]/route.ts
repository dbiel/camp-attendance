import { NextRequest, NextResponse } from 'next/server';
import {
  getStudent,
  updateStudent,
  deleteStudent,
  getStudentScheduleForDate,
} from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Strict ISO date: YYYY-MM-DD with required zero-padding.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`students:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const withSchedule = url.searchParams.get('with_schedule') === '1';
    const date = url.searchParams.get('date');

    if (withSchedule) {
      if (!date || !ISO_DATE_RE.test(date)) {
        return NextResponse.json(
          { error: 'date required in YYYY-MM-DD format when with_schedule=1' },
          { status: 400 }
        );
      }
    }

    const student = await getStudent(params.id);
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (withSchedule && date) {
      const schedule_for_date = await getStudentScheduleForDate(params.id, date);
      return NextResponse.json({ ...student, schedule_for_date });
    }

    return NextResponse.json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`students:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const data = await request.json();
    await updateStudent(params.id, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating student:', error);
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`students:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await deleteStudent(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting student:', error);
    return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 });
  }
}
