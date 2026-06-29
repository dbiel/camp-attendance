import { NextRequest, NextResponse } from 'next/server';
import { getCurrentEnsembleSession, getRosterForToken, getEnsembleSubmission } from '@/lib/ensemble-attendance';
import { toEnsembleRosterProjection } from '@/lib/projections';
import { getTodayDate, getCurrentTimeHHMM } from '@/lib/date';
import { activeMarkedAbsencesForStudents } from '@/lib/marked-absences';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { listTodayReportRefs } from '@/lib/ensemble-incidents';

export const dynamic = 'force-dynamic';

/**
 * Public ensemble-attendance page data (no auth, token-gated). Returns the live
 * session context (which rehearsal period is in session NOW for this ensemble,
 * or "no rehearsal") plus — when in a rehearsal — the scoped roster projection
 * (name/instrument/grade + opaque ref + score_rank, never PII or student_id)
 * and the marks already submitted for THIS day+period (keyed by the same ref).
 * Unknown/revoked tokens yield a uniform 404 (no enumeration). `?now=HH:MM`
 * overrides the clock for testing. Rate-limited per IP.
 */
const UNIFORM_FAILURE = { error: 'This link is no longer valid.' } as const;
const HHMM_RE = /^\d{1,2}:\d{2}$/;

export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const nowParam = new URL(request.url).searchParams.get('now');
  const nowHHMM = nowParam && HHMM_RE.test(nowParam) ? nowParam : undefined;

  const ctx = await getCurrentEnsembleSession(params.token, nowHHMM);
  if (!ctx) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });

  const session = {
    status: ctx.status,
    forced: ctx.forced,
    period_number: ctx.period_number,
    period_name: ctx.period_name,
    start_time: ctx.start_time,
    end_time: ctx.end_time,
    location: ctx.location,
    next: ctx.next,
  };

  // Always return the roster — when idle the page shows it greyed out (still
  // browsable) with a "Force open attendance" action; when live it's active.
  const rosterData = await getRosterForToken(params.token);
  if (!rosterData) return NextResponse.json(UNIFORM_FAILURE, { status: 404 });
  const roster = toEnsembleRosterProjection(rosterData.roster);

  const report_refs = (await listTodayReportRefs(params.token)) ?? [];

  const nowForAbsence = nowHHMM ?? getCurrentTimeHHMM();
  const markedMap = await activeMarkedAbsencesForStudents(
    rosterData.roster.map((s) => s.id),
    nowForAbsence,
    getTodayDate()
  );
  const marked_absent: Record<number, { note: string; until: string }> = {};
  rosterData.roster.forEach((s, i) => {
    const a = markedMap.get(s.id);
    if (a) marked_absent[i] = { note: a.note || 'Marked absent by office', until: a.until };
  });

  // Re-express the current slot's submitted marks by the opaque ref (never
  // student id). Only meaningful when a slot is live (rehearsal or forced).
  const submission = ctx.slot_key
    ? await getEnsembleSubmission(params.token, getTodayDate(), ctx.slot_key)
    : null;
  let marks_by_ref: Record<number, 'present' | 'absent'> | null = null;
  if (submission) {
    marks_by_ref = {};
    rosterData.roster.forEach((s, i) => {
      const m = submission.marks[s.id];
      if (m) marks_by_ref![i] = m;
    });
  }

  return NextResponse.json({
    ensemble: ctx.ensemble,
    label: ctx.label,
    session,
    roster,
    roster_size: rosterData.roster.length,
    report_refs,
    marked_absent,
    submission: submission
      ? { marks_by_ref, locked: true, submitted_at: submission.submitted_at, updated_at: submission.updated_at }
      : null,
  });
};
