import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getCase, listCaseEvents, listCasesForStudent, resolveCase } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(
  'lookup_admin',
  async (_request, { params }) => {
    const c = await getCase(params.id);
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [events, student, priorCases] = await Promise.all([
      listCaseEvents(c.id),
      // Unmatched reports have student_id '' — skip the student/prior lookups.
      c.student_id ? getStudent(c.student_id) : Promise.resolve(undefined),
      c.student_id ? listCasesForStudent(c.student_id) : Promise.resolve([]),
    ]);
    // Each prior report carries its own timeline so the detail page can show the
    // full found-data + updates history, not just a count.
    const prior = priorCases.filter((p) => p.id !== c.id);
    const prior_cases = await Promise.all(
      prior.map(async (p) => ({ ...p, events: await listCaseEvents(p.id) }))
    );
    return NextResponse.json({
      case: c,
      events,
      student: student ?? null,
      prior_cases,
    });
  },
  { rateLimitKey: 'cases' }
);

export const PATCH = withAuth<{ id: string }>(
  'super_admin',
  async (request, { params }) => {
    const body = await request.json().catch(() => null);
    const note = (body as { resolution_note?: unknown })?.resolution_note;
    if (typeof note !== 'string' || !note.trim()) {
      return NextResponse.json({ error: 'resolution_note required' }, { status: 400 });
    }
    const c = await getCase(params.id);
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (c.status === 'resolved') {
      return NextResponse.json({ error: 'Already resolved' }, { status: 409 });
    }
    const caller = await verifyAdmin(request);
    await resolveCase(params.id, note.trim(), caller?.email || 'unknown');
    return NextResponse.json({ ok: true });
  },
  { rateLimitKey: 'cases' }
);
