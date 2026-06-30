import { NextRequest, NextResponse } from 'next/server';
import {
  getStudent,
  updateStudent,
  deleteStudent,
  getStudentScheduleForDate,
} from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

// Strict ISO date: YYYY-MM-DD with required zero-padding.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Read + edit are available to lookup admins; deletion is super-admin-only.
export const GET = withAuth<{ id: string }>(
  'lookup_admin',
  async (request, { params }) => {
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
  },
  { rateLimitKey: 'students' }
);

export const PUT = withAuth<{ id: string }>(
  'lookup_admin',
  async (request, { params }) => {
    const body = await request.json();
    // Strip any client-supplied attribution; stamp it server-side from the
    // verified caller so edits are reliably traceable to a real admin.
    const { updated_by: _ub, updated_at: _ua, withdrawn_at: _wa, withdrawn_by: _wb, ...rest } = body ?? {};
    const caller = await verifyAdmin(request);
    const actor = caller?.email || caller?.uid || 'unknown';
    const now = new Date().toISOString();
    const data: Record<string, unknown> = { ...rest, updated_by: actor, updated_at: now };
    // "Remove from camp" / "Restore" toggles `withdrawn`; server-stamp (or clear)
    // the withdrawal attribution so it's never trusted from the client.
    if (Object.prototype.hasOwnProperty.call(rest, 'withdrawn')) {
      const withdrawing = !!(rest as { withdrawn?: unknown }).withdrawn;
      data.withdrawn = withdrawing;
      data.withdrawn_at = withdrawing ? now : null;
      data.withdrawn_by = withdrawing ? actor : null;
    }
    await updateStudent(params.id, data as Parameters<typeof updateStudent>[1]);
    return NextResponse.json({ success: true });
  },
  { rateLimitKey: 'students' }
);

export const DELETE = withAuth<{ id: string }>(
  'super_admin',
  async (_request, { params }) => {
    await deleteStudent(params.id);
    return NextResponse.json({ success: true });
  },
  { rateLimitKey: 'students' }
);
