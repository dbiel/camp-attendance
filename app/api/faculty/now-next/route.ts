import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getAllFacultyNowNext } from '@/lib/firestore';

export const dynamic = 'force-dynamic';

/**
 * Current + next session for every faculty member (one batch query) → the
 * Faculty table's Current/Next columns. ?now=HH:MM overrides the clock (testing).
 */
export const GET = withAuth('lookup_admin', async (request) => {
  const now = new URL(request.url).searchParams.get('now');
  const byFaculty = await getAllFacultyNowNext(
    now && /^\d{1,2}:\d{2}$/.test(now) ? now : undefined
  );
  return NextResponse.json({ byFaculty });
});
