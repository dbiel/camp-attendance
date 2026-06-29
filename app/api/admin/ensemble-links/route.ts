import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import {
  issueEnsembleLink,
  issueSelectorLink,
  listEnsembleLinks,
  listEnsembles,
  listSelectorLinks,
} from '@/lib/ensemble-links';

export const dynamic = 'force-dynamic';

/**
 * Manage open attendance links. super_admin only (only David generates/hands
 * these out). GET returns the ensembles (from the roster), the per-ensemble
 * links, and the shared picker (selector) links. POST issues a per-ensemble
 * link, or a shared picker link when `{ kind: 'selector' }`.
 */
export const GET = withAuth('super_admin', async () => {
  const [ensembles, links, selectorLinks] = await Promise.all([
    listEnsembles(),
    listEnsembleLinks(),
    listSelectorLinks(),
  ]);
  return NextResponse.json({ ensembles, links, selectorLinks });
});

export const POST = withAuth('super_admin', async (request) => {
  const body = (await request.json().catch(() => null)) as {
    ensemble?: unknown;
    label?: unknown;
    kind?: unknown;
  } | null;
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null;

  if (body?.kind === 'selector') {
    const link = await issueSelectorLink(label);
    return NextResponse.json(link);
  }

  const ensemble = typeof body?.ensemble === 'string' ? body.ensemble.trim() : '';
  if (!ensemble) {
    return NextResponse.json({ error: 'ensemble required' }, { status: 400 });
  }
  const link = await issueEnsembleLink(ensemble, label);
  return NextResponse.json(link);
});
