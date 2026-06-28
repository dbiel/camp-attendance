import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getCase, issueCombinedShareLink } from '@/lib/cases';

export const dynamic = 'force-dynamic';

const MAX_CASES = 10; // bound the blast radius if a URL leaks

/**
 * POST /api/cases/share-combined — issue ONE staff link covering several
 * selected reports. super_admin only.
 *
 * SERVER-SIDE enforcement (not just the UI): every selected report must exist
 * and share the SAME dorm building, so a single forwardable URL can never
 * bundle minors from different buildings (or hand a dorm staffer kids who
 * aren't theirs). Capped at MAX_CASES. The scope is the explicit selection —
 * never query-derived, so no future report silently joins a distributed link.
 */
export const POST = withAuth(
  'super_admin',
  async (request) => {
    const body = await request.json().catch(() => null);
    const raw = (body as { case_ids?: unknown })?.case_ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: 'Select at least one report' }, { status: 400 });
    }
    const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && !!x)));
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one report' }, { status: 400 });
    }
    if (ids.length > MAX_CASES) {
      return NextResponse.json({ error: `Up to ${MAX_CASES} reports per link` }, { status: 400 });
    }

    const cases = await Promise.all(ids.map((id) => getCase(id)));
    if (cases.some((c) => !c)) {
      return NextResponse.json({ error: 'A selected report no longer exists' }, { status: 400 });
    }
    // Can't share an unmatched ("No student found") report — there's no student
    // to locate, and it would crash the viewer's student lookup.
    if (cases.some((c) => c!.needs_match || !c!.student_id)) {
      return NextResponse.json(
        { error: 'A selected report has no matched student — match it first.' },
        { status: 400 }
      );
    }
    // Building-bound: all must share one dorm building. A case with no building
    // is only groupable if its division marks it a commuter — otherwise it's
    // ambiguous and we refuse rather than risk mixing buildings.
    const ambiguous = cases.find((c) => !c!.dorm_building && !/commut/i.test(c!.division ?? ''));
    if (ambiguous) {
      return NextResponse.json(
        { error: 'A selected report has no dorm building on file — can’t group it safely.' },
        { status: 400 }
      );
    }
    const buildings = new Set(cases.map((c) => c!.dorm_building ?? 'commuter'));
    if (buildings.size > 1) {
      return NextResponse.json(
        { error: 'Selected reports span multiple dorm buildings — send a separate link per building.' },
        { status: 400 }
      );
    }

    const rawLabel = (body as { recipient_label?: unknown })?.recipient_label;
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : null;
    const link = await issueCombinedShareLink(ids, label, new Date());
    return NextResponse.json(link);
  },
  { rateLimitKey: 'cases' }
);
