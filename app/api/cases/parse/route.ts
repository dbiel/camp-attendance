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
    const byId = new Map(students.map((s) => [s.id, s]));
    // One entry per kid, each with its own resolved candidate list.
    const people = parsed.people.map((p) => ({
      student_query: p.student_query,
      summary: p.summary,
      session_label: p.session_label,
      candidates: p.student_ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((s) => ({
          id: s!.id,
          name: `${s!.first_name} ${s!.last_name}`,
          ensemble: s!.ensemble,
          dorm_building: s!.dorm_building,
          instrument: s!.instrument,
        })),
    }));
    return NextResponse.json({
      ok: true,
      people,
      reporter: {
        reporter_contact_id: parsed.reporter_contact_id,
        reporter_name: parsed.reporter_name,
        reporter_phone: parsed.reporter_phone,
      },
      raw_text: text,
    });
  },
  { rateLimitKey: 'cases-parse' }
);
