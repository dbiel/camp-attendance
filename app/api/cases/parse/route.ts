import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { parseReport } from '@/lib/case-parse';
import { getStudents } from '@/lib/firestore';
import { listContacts } from '@/lib/contacts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withAuth(
  'super_admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const text = (body as { text?: unknown })?.text;
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    const [students, contacts] = await Promise.all([getStudents(), listContacts()]);
    const parsed = await parseReport(text, students, contacts);
    if (!parsed) {
      // Parse is an accelerator, never a gate — the client falls back to manual entry.
      return NextResponse.json({ ok: false, raw_text: text });
    }
    const candidates = parsed.student_ids
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({
        id: s!.id,
        name: `${s!.first_name} ${s!.last_name}`,
        ensemble: s!.ensemble,
        dorm_building: s!.dorm_building,
        instrument: s!.instrument,
      }));
    return NextResponse.json({ ok: true, parsed, candidates, raw_text: text });
  },
  { rateLimitKey: 'cases-parse' }
);
