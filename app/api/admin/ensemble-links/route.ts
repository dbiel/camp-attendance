import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { issueEnsembleLink, listEnsembleLinks, listEnsembles } from '@/lib/ensemble-links';

export const dynamic = 'force-dynamic';

/**
 * Manage the per-ensemble open attendance links. super_admin only (only David
 * generates/hands these out). GET returns the ensembles (from the roster) and
 * the links already issued; POST issues a fresh link for an ensemble.
 */
export const GET = withAuth('super_admin', async () => {
  const [ensembles, links] = await Promise.all([listEnsembles(), listEnsembleLinks()]);
  return NextResponse.json({ ensembles, links });
});

export const POST = withAuth('super_admin', async (request) => {
  const body = (await request.json().catch(() => null)) as {
    ensemble?: unknown;
    label?: unknown;
  } | null;
  const ensemble = typeof body?.ensemble === 'string' ? body.ensemble.trim() : '';
  if (!ensemble) {
    return NextResponse.json({ error: 'ensemble required' }, { status: 400 });
  }
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null;
  const link = await issueEnsembleLink(ensemble, label);
  return NextResponse.json(link);
});
