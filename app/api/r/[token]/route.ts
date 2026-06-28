import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken, validateCombinedToken, getCase, listCaseEvents } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { toStaffLinkProjection } from '@/lib/projections';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public two-way staff-link viewer (no auth, token-gated). Handles BOTH a
 * single per-case token and a combined `staff_links` token; always returns
 * `{ reports: [...] }` (1 or more) so the viewer is uniform. Each report is the
 * SCOPED projection plus a `ref` that is an OPAQUE INDEX into the link's case
 * set (never the real case id) — the viewer echoes it back to update the right
 * kid, leaking no internal id. No other PII, no other Report. Unknown /
 * revoked / expired / empty tokens all yield the SAME uniform 404 so the
 * endpoint can't enumerate valid tokens. Rate-limited per IP.
 */
const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`r:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const now = new Date();
  const single = await validateShareToken(params.token, now);
  let caseIds: string[];
  if (single) {
    caseIds = [single.caseId];
  } else {
    const combined = await validateCombinedToken(params.token, now);
    if (!combined) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
    caseIds = combined.caseIds;
  }

  const cases = await Promise.all(caseIds.map((id) => getCase(id)));
  const reports = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!c) continue;
    // Unmatched reports have student_id '' — never call getStudent('') (the
    // Admin SDK throws on an empty doc path, which would 500 the whole bundle).
    const [student, events] = await Promise.all([
      c.student_id ? getStudent(c.student_id) : Promise.resolve(null),
      listCaseEvents(c.id),
    ]);
    // ref = the index into the link's case set (opaque; never the case id).
    reports.push({ ref: i, ...toStaffLinkProjection(c, student ?? null, events) });
  }
  if (reports.length === 0) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  // D3 auto-resolve: a resolved kid STAYS visible (resolved banner, draft
  // preserved) so the counselor sees "found, thanks" — but once EVERY kid on the
  // link is resolved the link has no purpose, so it dies with the uniform 404.
  if (reports.every((r) => r.status === 'resolved')) {
    return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  }
  return NextResponse.json({ reports });
};
