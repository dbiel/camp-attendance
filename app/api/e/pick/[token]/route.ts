import { NextRequest, NextResponse } from 'next/server';
import { resolvePickerTargets } from '@/lib/ensemble-links';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public shared-picker data (no auth, token-gated). Validates the token is a
 * non-revoked selector link and returns each offered ensemble resolved to its
 * current per-ensemble `/e/<token>` plus roster count. Unknown / revoked /
 * non-selector tokens yield a uniform 404 (no enumeration). Rate-limited per IP.
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
  const items = await resolvePickerTargets(params.token);
  if (!items) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  return NextResponse.json({ items });
};
