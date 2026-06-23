import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { retagText, dismissText } from '@/lib/texts';
import type { TextTag } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_TAGS: ReadonlySet<string> = new Set(['camp', 'personal', 'unknown']);

// PATCH: re-tag a text (camp/personal/unknown). Never deletes — re-tag is
// recoverable. An explicit `reason` is stored; otherwise a "manual" marker.
export const PATCH = withAuth<{ id: string }>(
  'super_admin',
  async (request: NextRequest, { params }) => {
    const body = await request.json().catch(() => null);
    const tag = (body as { tag?: unknown })?.tag;
    if (typeof tag !== 'string' || !VALID_TAGS.has(tag)) {
      return NextResponse.json({ error: 'tag must be camp, personal, or unknown' }, { status: 400 });
    }
    const rawReason = (body as { reason?: unknown })?.reason;
    const reason =
      typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : 'manual re-tag';
    await retagText(params.id, tag as TextTag, reason);
    return NextResponse.json({ ok: true });
  },
  { rateLimitKey: 'texts' }
);

// DELETE: dismiss (remove) a text from the inbox.
export const DELETE = withAuth<{ id: string }>(
  'super_admin',
  async (_request, { params }) => {
    await dismissText(params.id);
    return NextResponse.json({ ok: true });
  },
  { rateLimitKey: 'texts' }
);
