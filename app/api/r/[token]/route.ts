import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken, getCase, listCaseEvents } from '@/lib/cases';
import { getStudent } from '@/lib/firestore';
import { toStaffLinkProjection } from '@/lib/projections';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public two-way staff-link viewer (no auth, token-gated). Returns the SCOPED
 * projection only — never PII, never another Report. Unknown / revoked /
 * expired tokens all yield the SAME uniform 404 body so the endpoint can't be
 * used to enumerate valid tokens. Rate-limited per IP.
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
  const valid = await validateShareToken(params.token, new Date());
  if (!valid) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });

  const c = await getCase(valid.caseId);
  if (!c) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });

  const [student, events] = await Promise.all([
    getStudent(c.student_id),
    listCaseEvents(c.id),
  ]);
  return NextResponse.json(toStaffLinkProjection(c, student ?? null, events));
};
