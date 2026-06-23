import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken, getCase, addCaseEvent } from '@/lib/cases';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public two-way staff-link update endpoint (no auth, token-gated). Appends a
 * `staff_update` event David sees in the Report timeline. Only works while the
 * link is valid — an expired/revoked/unknown token yields 410 (the link is
 * gone). Rate-limited per IP.
 */
export const POST = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`r-update:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const valid = await validateShareToken(params.token, new Date());
  if (!valid) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  }

  const json = await request.json().catch(() => null);
  const text = (json as { body?: unknown })?.body;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Update text required' }, { status: 400 });
  }

  const c = await getCase(valid.caseId);
  if (!c) return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });

  const actor = c.share_recipient_label || 'staff link';
  const id = await addCaseEvent(valid.caseId, 'staff_update', text.trim(), actor);
  return NextResponse.json({ id });
};
