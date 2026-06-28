import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { withAuth } from '@/lib/with-auth';
import { listCases, createCase } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  'lookup_admin',
  async (request: NextRequest) => {
    const status = request.nextUrl.searchParams.get('status') === 'resolved' ? 'resolved' : 'active';
    const cases = await listCases(status);
    return NextResponse.json({ cases });
  },
  { rateLimitKey: 'cases' }
);

interface PersonInput {
  student_id?: unknown;
  student_name?: unknown;
  needs_match?: unknown;
  summary?: unknown;
  session_label?: unknown;
}

/** Create one report — matched (valid student_id) or unmatched ("No student
 * found": student_id '', needs_match true, raw name preserved). Throws on a
 * non-empty student_id that doesn't resolve. */
async function createForPerson(
  p: PersonInput,
  shared: { raw_text: string; reporter_contact_id: string | null; reporter_name: string | null },
  createdBy: string,
  batchId: string | null
): Promise<string> {
  const summary = typeof p.summary === 'string' && p.summary.trim() ? p.summary : 'Reported missing';
  const session_label = typeof p.session_label === 'string' ? p.session_label : null;
  const hasId = typeof p.student_id === 'string' && p.student_id !== '';
  const unmatched = p.needs_match === true || !hasId;

  if (unmatched) {
    const name =
      typeof p.student_name === 'string' && p.student_name.trim()
        ? p.student_name.trim()
        : 'Unknown student';
    return createCase({
      student_id: '',
      student_name: name,
      summary,
      raw_text: shared.raw_text,
      reporter_contact_id: shared.reporter_contact_id,
      reporter_name: shared.reporter_name,
      session_label,
      source: 'text',
      needs_match: true,
      batch_id: batchId,
      created_by: createdBy,
    });
  }

  const student = await getStudent(p.student_id as string);
  if (!student) throw new Error(`Unknown student ${p.student_id}`);
  return createCase({
    student_id: p.student_id as string,
    student_name: `${student.first_name} ${student.last_name}`,
    summary,
    raw_text: shared.raw_text,
    reporter_contact_id: shared.reporter_contact_id,
    reporter_name: shared.reporter_name,
    session_label,
    dorm_building: student.dorm_building ?? null,
    dorm_room: student.dorm_room ?? null,
    instrument: student.instrument ?? null,
    division: student.division ?? null,
    source: 'text',
    batch_id: batchId,
    created_by: createdBy,
  });
}

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const caller = await verifyAdmin(request);
    const b = body as Record<string, unknown>;

    // ─── Batch: one paste → N reports (matched and/or "No student found"). ───
    if (Array.isArray(b.people)) {
      const raw_text = b.raw_text;
      if (typeof raw_text !== 'string') {
        return NextResponse.json({ error: 'raw_text required' }, { status: 400 });
      }
      const people = b.people as PersonInput[];
      if (people.length === 0) {
        return NextResponse.json({ error: 'people[] is empty' }, { status: 400 });
      }
      const shared = {
        raw_text,
        reporter_contact_id: typeof b.reporter_contact_id === 'string' ? b.reporter_contact_id : null,
        reporter_name: typeof b.reporter_name === 'string' ? b.reporter_name : null,
      };
      // Group reports filed together so they can be shown/managed as a set.
      const batchId = people.length > 1 ? randomBytes(8).toString('hex') : null;
      const createdBy = caller?.email || 'unknown';

      const settled = await Promise.allSettled(
        people.map((p) => createForPerson(p, shared, createdBy, batchId))
      );
      // Per-person, IN ORDER — so the client maps each result back to its card,
      // surfaces exactly which kid failed, and retries only those (no dup-filing).
      const results = settled.map((r) =>
        r.status === 'fulfilled'
          ? { ok: true as const, id: r.value }
          : { ok: false as const, error: String((r.reason as Error)?.message ?? r.reason) }
      );
      const ids = results.flatMap((r) => (r.ok ? [r.id] : []));
      const errors = results.flatMap((r) => (!r.ok ? [r.error] : []));
      if (ids.length === 0) {
        return NextResponse.json({ error: errors[0] || 'No reports created', errors, results }, { status: 400 });
      }
      return NextResponse.json({ ids, errors, results });
    }

    // ─── Single (back-compat): unchanged contract → { id }. ───
    const { student_id, summary, raw_text, reporter_contact_id, reporter_name, session_label } = b;
    if (typeof student_id !== 'string' || typeof summary !== 'string' || typeof raw_text !== 'string') {
      return NextResponse.json({ error: 'student_id, summary, raw_text required' }, { status: 400 });
    }
    const student = await getStudent(student_id);
    if (!student) return NextResponse.json({ error: 'Unknown student' }, { status: 400 });

    const id = await createCase({
      student_id,
      student_name: `${student.first_name} ${student.last_name}`,
      summary,
      raw_text,
      reporter_contact_id: typeof reporter_contact_id === 'string' ? reporter_contact_id : null,
      reporter_name: typeof reporter_name === 'string' ? reporter_name : null,
      session_label: typeof session_label === 'string' ? session_label : null,
      dorm_building: student.dorm_building ?? null,
      dorm_room: student.dorm_room ?? null,
      instrument: student.instrument ?? null,
      division: student.division ?? null,
      source: 'text',
      created_by: caller?.email || 'unknown',
    });
    return NextResponse.json({ id });
  },
  { rateLimitKey: 'cases' }
);
