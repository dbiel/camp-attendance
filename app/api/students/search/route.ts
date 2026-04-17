import { NextRequest, NextResponse } from 'next/server';
import { searchStudents } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_QUERY_LEN = 2;

export const GET = withAuth(
  'admin',
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const qRaw = url.searchParams.get('q');
    const q = (qRaw ?? '').trim();
    if (!q || q.length < MIN_QUERY_LEN) {
      return NextResponse.json(
        { error: `q required (min ${MIN_QUERY_LEN} chars)` },
        { status: 400 }
      );
    }

    const limitRaw = url.searchParams.get('limit');
    let limit = DEFAULT_LIMIT;
    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, MAX_LIMIT);
      }
    }

    const response = await searchStudents(q, limit);
    return NextResponse.json(response);
  },
  { rateLimitKey: 'students-search' }
);
