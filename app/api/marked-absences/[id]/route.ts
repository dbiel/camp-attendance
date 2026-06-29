import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { clearMarkedAbsence } from '@/lib/marked-absences';

export const dynamic = 'force-dynamic';

export const DELETE = withAuth<{ id: string }>('lookup_admin', async (_request, { params }) => {
  await clearMarkedAbsence(params.id, 'manual');
  return NextResponse.json({ ok: true });
});
