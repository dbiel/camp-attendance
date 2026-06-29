import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getPeriods, getSessions } from '@/lib/firestore';
import { getTodayDate, getCurrentTimeHHMM } from '@/lib/date';
import { PICKER_ENSEMBLES } from '@/lib/ensemble-links';
import {
  buildAttendanceHistory,
  type AttendanceSubmission,
  type RehearsalSlot,
} from '@/lib/attendance-history';

export const dynamic = 'force-dynamic';

/**
 * Admin attendance history: which ensembles took attendance, when, and which
 * scheduled rehearsals were missed, for the past periods of a selectable day.
 * Read-only; lookup_admin and up. All derivation lives in lib/attendance-history
 * so this route just gathers Firestore data and hands it over.
 *
 *   GET /api/admin/attendance-history?day=YYYY-MM-DD&now=HH:MM
 *   - day defaults to today (camp tz); now defaults to the current camp clock
 *     (the ?now override exists for testing past-period determination).
 */
export const GET = withAuth(
  'lookup_admin',
  async (req: NextRequest) => {
    const today = getTodayDate();
    const day = req.nextUrl.searchParams.get('day') || today;
    const nowParam = req.nextUrl.searchParams.get('now');
    const nowHHMM = nowParam && /^\d{1,2}:\d{2}$/.test(nowParam) ? nowParam : getCurrentTimeHHMM();

    const [periods, sessions, snap] = await Promise.all([
      getPeriods(),
      getSessions(),
      adminDb.collection('ensemble_attendance').get(),
    ]);

    const rehearsalSessions: RehearsalSlot[] = sessions
      .filter((s) => s.type === 'rehearsal' && !!s.ensemble)
      .map((s) => ({ ensemble: s.ensemble as string, period_number: Number(s.period_id) }))
      .filter((r) => Number.isFinite(r.period_number));

    const submissions: AttendanceSubmission[] = snap.docs.map((d) => {
      const x = d.data() as {
        ensemble?: string;
        day_key?: string;
        period_number?: number;
        period_name?: string;
        marks?: Record<string, 'present' | 'absent'>;
        roster_size?: number;
        submitted_at?: string;
      };
      // Doc id = `${token}__${day}__${slotKey}`; slotKey `H<hour>` ⇒ force-opened.
      const slotKey = d.id.split('__').pop() ?? '';
      return {
        ensemble: x.ensemble ?? '',
        day_key: x.day_key ?? '',
        period_number: x.period_number ?? 0,
        period_name: x.period_name ?? (x.period_number ? `Period ${x.period_number}` : '—'),
        marks: x.marks ?? {},
        roster_size: x.roster_size ?? 0,
        submitted_at: x.submitted_at ?? '',
        forced: slotKey.startsWith('H'),
      };
    });
    const allDayKeys = [...new Set(submissions.map((s) => s.day_key).filter(Boolean))];

    const data = buildAttendanceHistory({
      day,
      today,
      nowHHMM,
      periods,
      rehearsalSessions,
      submissions,
      allDayKeys,
      ensembles: PICKER_ENSEMBLES,
    });
    return NextResponse.json(data);
  },
  { rateLimitKey: 'admin-attendance-history' }
);
