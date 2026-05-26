import { NextRequest, NextResponse } from 'next/server';
import { getDayCoverage } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth('admin', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'Missing date' }, { status: 400 });
  }
  const rows = await getDayCoverage(date);
  return NextResponse.json({ rows });
});
