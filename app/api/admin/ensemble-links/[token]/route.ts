import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { revokeEnsembleLink } from '@/lib/ensemble-links';

export const dynamic = 'force-dynamic';

/** Revoke an ensemble attendance link (super_admin). The token stops validating
 * immediately, so the open page goes to its uniform 404. */
export const DELETE = withAuth<{ token: string }>('super_admin', async (_request, { params }) => {
  await revokeEnsembleLink(params.token);
  return NextResponse.json({ ok: true });
});
