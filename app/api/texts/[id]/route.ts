import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { retagText, dismissText, getText, setTextEscalated } from '@/lib/texts';
import type { TextTag } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_TAGS: ReadonlySet<string> = new Set(['camp', 'personal', 'unknown']);

// PATCH: re-tag a text (camp/personal/unknown), OR link it to a Report it was
// escalated into (`escalated_case_id`). Re-tag never deletes — it's
// recoverable. Escalation is one-way and guarded against double-escalation so a
// text can't be linked to two Reports.
export const PATCH = withAuth<{ id: string }>(
  'super_admin',
  async (request: NextRequest, { params }) => {
    const body = await request.json().catch(() => null);

    // Escalation link (Plan C): set the originating text's escalated_case_id.
    const escalatedCaseId = (body as { escalated_case_id?: unknown })?.escalated_case_id;
    if (escalatedCaseId !== undefined) {
      if (typeof escalatedCaseId !== 'string' || !escalatedCaseId.trim()) {
        return NextResponse.json({ error: 'escalated_case_id must be a non-empty string' }, { status: 400 });
      }
      const text = await getText(params.id);
      if (!text) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (text.escalated_case_id) {
        return NextResponse.json(
          { error: 'Already escalated', escalated_case_id: text.escalated_case_id },
          { status: 409 }
        );
      }
      await setTextEscalated(params.id, escalatedCaseId);
      return NextResponse.json({ ok: true });
    }

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
