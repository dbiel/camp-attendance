import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getSessions, getPeriods } from '@/lib/firestore';
import { currentAndNextSession, formatNextLabel, type ScheduleSlot } from '@/lib/schedule';
import { getCurrentTimeHHMM } from '@/lib/date';

export const dynamic = 'force-dynamic';

/**
 * GET /api/schedule/ensemble-now-next — current/next session per ENSEMBLE,
 * computed once server-side at the current camp time. The Students table maps
 * each row to its ensemble's now/next — cheap (≈91 sessions + 10 periods) vs a
 * per-student lookup across 644 rows. This reflects the ensemble base schedule;
 * a student's specific elective is shown in their expandable per-student view.
 */
export const GET = withAuth(
  'lookup_admin',
  async () => {
    const [sessions, periods] = await Promise.all([getSessions(), getPeriods()]);
    const periodMap = new Map(periods.map((p) => [p.id, p]));

    const byEnsembleSlots: Record<string, ScheduleSlot[]> = {};
    for (const s of sessions) {
      if (!s.ensemble) continue;
      const p = periodMap.get(s.period_id);
      (byEnsembleSlots[s.ensemble] ||= []).push({
        session_id: s.id,
        name: s.name,
        type: s.type,
        location: s.location ?? null,
        period_number: p?.number ?? 0,
        start_time: p?.start_time ?? '',
        end_time: p?.end_time ?? '',
      });
    }

    const now = getCurrentTimeHHMM();
    const byEnsemble: Record<string, { current: string | null; next: string }> = {};
    for (const [ensemble, slots] of Object.entries(byEnsembleSlots)) {
      const { current, next } = currentAndNextSession(slots, now);
      byEnsemble[ensemble] = { current: current?.name ?? null, next: formatNextLabel(next) };
    }

    return NextResponse.json({ now, byEnsemble });
  },
  { rateLimitKey: 'ensemble-now-next' }
);
