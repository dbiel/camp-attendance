import { NextResponse } from 'next/server';
import {
  getStudentSchedule,
  getStudentScheduleSessions,
  getSession,
  addStudentToSession,
  removeStudentFromSession,
} from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(
  'lookup_admin',
  async (request, { params }) => {
    const { searchParams } = new URL(request.url);
    // ?format=slots → lean per-period slots (incl. faculty) for the now/next
    // resolver + expandable schedule. Default keeps the legacy attendance-joined
    // schedule used elsewhere.
    if (searchParams.get('format') === 'slots') {
      const slots = await getStudentScheduleSessions(params.id);
      return NextResponse.json({ slots });
    }
    const date = searchParams.get('date');
    const schedule = await getStudentSchedule(params.id, date || undefined);
    return NextResponse.json(schedule);
  },
  { rateLimitKey: 'students-schedule' }
);

// Moves a student's enrollment for ONE period: drops whatever session(s) they
// currently hold in that period and (optionally) enrolls them in a new one.
// Used by the admin schedule picker — one dropdown per period.
export const PUT = withAuth<{ id: string }>(
  'lookup_admin',
  async (request, { params }) => {
    const body = await request.json().catch(() => null);
    const periodId = body?.period_id;
    const sessionId: string | null = body?.session_id ?? null;

    if (!periodId || typeof periodId !== 'string') {
      return NextResponse.json({ error: 'period_id required' }, { status: 400 });
    }
    if (sessionId !== null && typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'session_id must be a string or null' }, { status: 400 });
    }
    if (sessionId) {
      const session = await getSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      if (session.period_id !== periodId) {
        return NextResponse.json({ error: 'session_id does not belong to period_id' }, { status: 400 });
      }
    }

    const current = await getStudentScheduleSessions(params.id);
    const existingInPeriod = current.filter((s) => s.period_id === periodId);
    for (const slot of existingInPeriod) {
      if (slot.session_id !== sessionId) {
        await removeStudentFromSession(slot.session_id, params.id);
      }
    }
    if (sessionId && !existingInPeriod.some((s) => s.session_id === sessionId)) {
      await addStudentToSession(sessionId, params.id);
    }

    const slots = await getStudentScheduleSessions(params.id);
    return NextResponse.json({ slots });
  },
  { rateLimitKey: 'students-schedule' }
);
