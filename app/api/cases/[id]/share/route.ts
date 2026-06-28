import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getCase, issueShareLink, revokeShareLink } from '@/lib/cases';

export const dynamic = 'force-dynamic';

/**
 * Issue (POST) or revoke (DELETE) the two-way staff share link for a Report.
 * super_admin only (only David sends links). POST rotates the token and starts
 * a fresh 2h window; the returned `url` is the `/r/<token>` viewer path.
 */
export const POST = withAuth<{ id: string }>(
  'super_admin',
  async (request, { params }) => {
    const c = await getCase(params.id);
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await request.json().catch(() => null);
    const rawLabel = (body as { recipient_label?: unknown })?.recipient_label;
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : null;
    const link = await issueShareLink(params.id, label, new Date());
    return NextResponse.json(link);
  },
  { rateLimitKey: 'cases' }
);

export const DELETE = withAuth<{ id: string }>(
  'super_admin',
  async (_request, { params }) => {
    const c = await getCase(params.id);
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await revokeShareLink(params.id);
    return NextResponse.json({ ok: true });
  },
  { rateLimitKey: 'cases' }
);
