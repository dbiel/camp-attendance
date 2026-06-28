import { NextRequest, NextResponse } from 'next/server';
import { getRosterForToken, getEnsembleSubmission } from '@/lib/ensemble-attendance';
import { toEnsembleRosterProjection } from '@/lib/projections';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public ensemble-attendance page data (no auth, token-gated). Returns the
 * ensemble's roster as the SCOPED projection (name/instrument/grade + opaque
 * ref + score_rank — never PII or student_id) plus the current submitted marks
 * (keyed by the same opaque ref). Unknown/revoked tokens yield a uniform 404
 * (no enumeration). Rate-limited per IP.
 *
 * Accepted residual (security review): a valid token does extra Firestore reads
 * (roster + submission) so it responds marginally slower than an invalid one —
 * a faint timing signal. Not mitigated: the token is 128-bit random, so timing
 * can't enumerate the space (it only confirms a token you already hold), and
 * network jitter dominates the delta. Adding artificial delay would just slow
 * real managers down.
 */
const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const data = await getRosterForToken(params.token);
  if (!data) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });

  const roster = toEnsembleRosterProjection(data.roster);

  // Re-express any existing submission's marks by the opaque ref (never student id).
  const submission = await getEnsembleSubmission(params.token);
  let marks_by_ref: Record<number, 'present' | 'absent'> | null = null;
  if (submission) {
    marks_by_ref = {};
    data.roster.forEach((s, i) => {
      const m = submission.marks[s.id];
      if (m) marks_by_ref![i] = m;
    });
  }

  return NextResponse.json({
    ensemble: data.ensemble,
    label: data.label,
    roster,
    roster_size: data.roster.length,
    submission: submission
      ? { marks_by_ref, locked: true, submitted_at: submission.submitted_at, updated_at: submission.updated_at }
      : null,
  });
};
