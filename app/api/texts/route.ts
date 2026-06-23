import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { listTexts } from '@/lib/texts';
import type { TextTag } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_TAGS: ReadonlySet<string> = new Set(['camp', 'personal', 'unknown']);

export const GET = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const raw = request.nextUrl.searchParams.get('tag');
    const tag = raw && VALID_TAGS.has(raw) ? (raw as TextTag) : undefined;
    const texts = await listTexts(tag ? { tag } : {});
    return NextResponse.json({ texts });
  },
  { rateLimitKey: 'texts' }
);
