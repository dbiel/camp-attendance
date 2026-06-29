import { NextRequest, NextResponse } from 'next/server';
import { postEnsembleIncidentUpdate } from '@/lib/ensemble-incidents';
import { checkRateLimit, checkRateLimitDurable, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export const POST = async (
  request: NextRequest,
  { params }: { params: { token: string; ref: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e-incident-update:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  if (!(await checkRateLimitDurable(`e-incident-update:${params.token}`, { max: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const ref = Number(params.ref);
  if (!Number.isInteger(ref) || ref < 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const json = await request.json().catch(() => null);
  const text = (json as { body?: unknown })?.body;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Update text required' }, { status: 400 });
  }
  if (text.trim().length > 2000) {
    return NextResponse.json({ error: 'Update is too long.' }, { status: 400 });
  }
  const r = await postEnsembleIncidentUpdate(params.token, ref, text.trim());
  if (!r.ok) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 410 });
  return NextResponse.json({ id: 'ok' });
};
