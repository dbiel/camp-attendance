import { NextRequest, NextResponse } from 'next/server';
import { submitEnsembleAttendance } from '@/lib/ensemble-attendance';
import { checkRateLimit, checkRateLimitDurable, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public ensemble-attendance submit (no auth, token-gated). Body:
 * `{ marks: { [ref]: 'present' | 'absent' }, roster_size }`. The server
 * re-derives the roster from the token's ensemble and accepts ONLY present/
 * absent for in-range refs — an anonymous submitter can never create free-form
 * data or touch another ensemble. Absences become reports; a later Absent→
 * Present flips to a tardy-arrival update. Rate-limited per IP.
 */
const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;

export const POST = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  // Durable per-LINK cap (shared across instances; IP-spoof-proof). 30/min is
  // ample for a manager re-submitting; bounds spam/cost on a leaked link.
  if (!(await checkRateLimitDurable(`e-submit:${params.token}`, { max: 30, windowMs: 60_000 }))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    marks?: unknown;
    roster_size?: unknown;
  } | null;

  const rawMarks = body?.marks;
  if (!rawMarks || typeof rawMarks !== 'object' || Array.isArray(rawMarks)) {
    return NextResponse.json({ error: 'marks required' }, { status: 400 });
  }
  // Coerce to a plain ref→mark map; submit() re-validates every ref + value.
  const marksByRef: Record<number, 'present' | 'absent'> = {};
  for (const [k, val] of Object.entries(rawMarks as Record<string, unknown>)) {
    const ref = Number(k);
    if (Number.isInteger(ref) && (val === 'present' || val === 'absent')) {
      marksByRef[ref] = val;
    }
  }

  const expectedRosterSize =
    typeof body?.roster_size === 'number' ? body.roster_size : undefined;

  const result = await submitEnsembleAttendance({
    token: params.token,
    marksByRef,
    expectedRosterSize,
  });

  if (!result.ok) {
    if (result.reason === 'roster_changed') {
      return NextResponse.json(
        { error: 'The roster changed — please reload before submitting.' },
        { status: 409 }
      );
    }
    return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    absent_count: result.absent_count,
    newly_absent: result.newly_absent,
    arrived_count: result.arrived_count,
  });
};
