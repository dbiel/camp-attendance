import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken, validateCombinedToken, getCase, addCaseEvent } from '@/lib/cases';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public two-way staff-link update endpoint (no auth, token-gated). Appends a
 * `staff_update` event David sees in the Report timeline. Handles single and
 * combined links; for a combined link the `ref` (case id) MUST belong to that
 * link's case set — a caller can never post to a report outside their link.
 * Expired/revoked/unknown → 410. Rate-limited per IP.
 */
export const POST = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`r-update:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const now = new Date();
  const single = await validateShareToken(params.token, now);
  let allowedIds: string[];
  let recipientLabel: string | null = null;
  if (single) {
    allowedIds = [single.caseId];
  } else {
    const combined = await validateCombinedToken(params.token, now);
    if (!combined) {
      return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
    }
    allowedIds = combined.caseIds;
    recipientLabel = combined.recipientLabel;
  }

  const json = await request.json().catch(() => null);
  const text = (json as { body?: unknown })?.body;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Update text required' }, { status: 400 });
  }
  if (text.trim().length > 2000) {
    return NextResponse.json({ error: 'Update is too long.' }, { status: 400 });
  }
  // `ref` is an opaque INDEX into this link's case set (default 0 for a single
  // link). A caller can only ever update a report inside their own link.
  const ref = (json as { ref?: unknown })?.ref;
  const idx = typeof ref === 'number' && Number.isInteger(ref) ? ref : 0;
  if (idx < 0 || idx >= allowedIds.length) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  }
  const targetId = allowedIds[idx]!;

  const c = await getCase(targetId);
  if (!c) return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
  // Don't accept staff updates on an already-resolved report (matches the
  // viewer, which hides the box once resolved).
  if (c.status === 'resolved') {
    return NextResponse.json({ error: 'This report has been resolved.' }, { status: 410 });
  }

  const actor = (single ? c.share_recipient_label : recipientLabel) || 'staff link';
  const id = await addCaseEvent(targetId, 'staff_update', text.trim(), actor);
  return NextResponse.json({ id });
};
