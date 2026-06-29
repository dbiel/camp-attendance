import { NextRequest, NextResponse } from 'next/server';
import { getEnsembleIncidentByRef } from '@/lib/ensemble-incidents';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string; ref: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e-incident:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const ref = Number(params.ref);
  if (!Number.isInteger(ref) || ref < 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const incident = await getEnsembleIncidentByRef(params.token, ref);
  if (!incident) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  return NextResponse.json({ incident });
};
