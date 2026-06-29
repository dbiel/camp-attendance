import { adminDb } from './firebase-admin';
import { buildCaseDoc, buildEventDoc, CASES_COLLECTION, EVENTS_COLLECTION } from './cases';
import { getEnsembleRoster, validateEnsembleToken } from './ensemble-links';
import { getTodayDate, getCurrentTimeHHMM } from './date';
import { getSessions, getPeriods } from './firestore';
import { resolveEnsembleNow, type ScheduleSlot } from './schedule';
import type { Student } from './types';

/**
 * Phase 6 — submit an ensemble's attendance from the open `/e/<token>` page and
 * turn absences into incident reports on David's hub.
 *
 * Trust model: the submitter is anonymous, so NOTHING about who/what they can
 * touch is trusted from the request. We re-derive the roster server-side from
 * the TOKEN's ensemble, accept ONLY present/absent for refs that index into
 * that roster, and dedupe so a double-submit can't spam duplicate reports.
 *
 * One submission doc per ensemble-link per camp day (id = `${token}__${day}`)
 * holds the marks + the case id created for each absent student, so:
 *  - first submit: each Absent → one new report (source 'ensemble_attendance').
 *  - later change Absent→Present (kid showed up late): appends "arrived in
 *    class — tardy" to that student's report + flags it, surfacing on the hub
 *    via the normal poll (NO external notification — no-contact rule).
 *  - Present→Absent after submit: files a report for the newly-absent kid.
 *  - unchanged marks: no-op (idempotent; dedup via the case-id map).
 */

const SUBMISSIONS = 'ensemble_attendance';

type Mark = 'present' | 'absent';

interface SubmissionDoc {
  token: string;
  ensemble: string;
  day_key: string;
  period_number: number;
  period_name: string;
  marks: Record<string, Mark>; // studentId → mark
  case_ids: Record<string, string>; // studentId → the report filed for them
  submitted_at: string;
  updated_at: string;
  roster_size: number;
}

export type SubmitResult =
  | { ok: false; reason: 'not_found' | 'roster_changed' | 'no_rehearsal' }
  | { ok: true; absent_count: number; arrived_count: number; newly_absent: number };

// Submission doc id keyed by a SLOT: `P<n>` for a scheduled period, `H<hour>`
// for a force-opened clock hour. Clock hours (8–17) overlap real period numbers
// (1–10), so the P/H prefix is load-bearing — never key forced + scheduled to
// the same doc.
function docId(token: string, day: string, slotKey: string): string {
  return `${token}__${day}__${slotKey}`;
}

export interface CurrentPeriod {
  period_number: number;
  period_name: string;
  period_id: string;
  session_id: string;
  start_time: string;
  end_time: string;
  location: string | null;
  forced: boolean;
  slot_key: string; // `P<n>` (scheduled) or `H<hour>` (forced)
}

/** A force-opened attendance window: the current clock hour [HH:00, HH+1:00). */
export function forcedPeriodFor(nowHHMM: string): CurrentPeriod {
  const hour = Number((nowHHMM.split(':')[0] ?? '0'));
  const start = `${String(hour).padStart(2, '0')}:00`;
  const end = `${String(hour + 1).padStart(2, '0')}:00`;
  return {
    period_number: hour,
    period_name: 'Forced attendance',
    period_id: `H${hour}`,
    session_id: '',
    start_time: start,
    end_time: end,
    location: null,
    forced: true,
    slot_key: `H${hour}`,
  };
}

export interface EnsembleSessionContext {
  ensemble: string;
  label: string | null;
  now: string; // HH:MM used
  status: 'rehearsal' | 'no_rehearsal' | 'forced';
  forced: boolean;
  slot_key: string | null;
  period_number: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  next: { period_name: string; start_time: string } | null;
}

const HHMM_RE = /^\d{1,2}:\d{2}$/;

/** Build the ensemble's schedule slots (rehearsals included) + a period-name map. */
async function loadEnsembleSlots(
  ensemble: string
): Promise<{ slots: ScheduleSlot[]; periodName: Map<number, string> }> {
  const [sessions, periods] = await Promise.all([getSessions(), getPeriods()]);
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const periodName = new Map<number, string>(periods.map((p) => [p.number, p.name]));
  const slots: ScheduleSlot[] = [];
  for (const s of sessions) {
    if (s.ensemble !== ensemble) continue;
    const p = periodById.get(s.period_id);
    slots.push({
      session_id: s.id,
      name: s.name,
      type: s.type,
      location: s.location ?? null,
      period_number: p?.number ?? 0,
      start_time: p?.start_time ?? '',
      end_time: p?.end_time ?? '',
    });
  }
  return { slots, periodName };
}

/** The ensemble's CURRENT rehearsal period (server truth for keying), or null. */
export async function resolveCurrentPeriod(
  ensemble: string,
  nowHHMM: string = getCurrentTimeHHMM()
): Promise<CurrentPeriod | null> {
  const { slots, periodName } = await loadEnsembleSlots(ensemble);
  const r = resolveEnsembleNow(slots, nowHHMM);
  if (r.status !== 'rehearsal') return null;
  const c = r.current;
  return {
    period_number: c.period_number,
    period_name: periodName.get(c.period_number) ?? `Period ${c.period_number}`,
    period_id: String(c.period_number),
    session_id: c.session_id,
    start_time: c.start_time,
    end_time: c.end_time,
    location: c.location,
    forced: false,
    slot_key: `P${c.period_number}`,
  };
}

/** Full session context for the public page (handles invalid token + idle). */
export async function getCurrentEnsembleSession(
  token: string,
  nowHHMM?: string
): Promise<EnsembleSessionContext | null> {
  const v = await validateEnsembleToken(token);
  if (!v) return null;
  const now = nowHHMM && HHMM_RE.test(nowHHMM) ? nowHHMM : getCurrentTimeHHMM();
  const { slots, periodName } = await loadEnsembleSlots(v.ensemble);
  const r = resolveEnsembleNow(slots, now);
  const base = { ensemble: v.ensemble, label: v.label, now };
  if (r.status === 'rehearsal') {
    const c = r.current;
    return {
      ...base,
      status: 'rehearsal',
      forced: false,
      slot_key: `P${c.period_number}`,
      period_number: c.period_number,
      period_name: periodName.get(c.period_number) ?? `Period ${c.period_number}`,
      start_time: c.start_time,
      end_time: c.end_time,
      location: c.location,
      next: null,
    };
  }
  // No scheduled rehearsal — but if attendance was force-opened this clock hour
  // (a submission already exists for the H<hour> slot), resume it so a browser
  // refresh mid-hour stays live until the hour ends.
  const fp = forcedPeriodFor(now);
  const forcedSub = await getEnsembleSubmission(token, getTodayDate(), fp.slot_key);
  if (forcedSub) {
    return {
      ...base,
      status: 'forced',
      forced: true,
      slot_key: fp.slot_key,
      period_number: fp.period_number,
      period_name: fp.period_name,
      start_time: fp.start_time,
      end_time: fp.end_time,
      location: null,
      next: null,
    };
  }
  return {
    ...base,
    status: 'no_rehearsal',
    forced: false,
    slot_key: null,
    period_number: null,
    period_name: null,
    start_time: null,
    end_time: null,
    location: null,
    next: r.next
      ? {
          period_name: periodName.get(r.next.period_number) ?? `Period ${r.next.period_number}`,
          start_time: r.next.start_time,
        }
      : null,
  };
}

/** Stable roster ordering (by id) so a ref index means the same student on GET
 * and on submit, regardless of how the client sorts the display. */
function idSorted(roster: Student[]): Student[] {
  return [...roster].sort((a, b) => a.id.localeCompare(b.id));
}

/** Read the current (locked) submission for a link+day+slot, if any. */
export async function getEnsembleSubmission(
  token: string,
  day: string,
  slotKey: string
): Promise<SubmissionDoc | null> {
  const doc = await adminDb.collection(SUBMISSIONS).doc(docId(token, day, slotKey)).get();
  return doc.exists ? (doc.data() as SubmissionDoc) : null;
}

/** The id-sorted roster for a token (used by the GET route to build refs). */
export async function getRosterForToken(token: string): Promise<{ ensemble: string; label: string | null; roster: Student[] } | null> {
  const v = await validateEnsembleToken(token);
  if (!v) return null;
  const roster = idSorted(await getEnsembleRoster(v.ensemble));
  return { ensemble: v.ensemble, label: v.label, roster };
}

/**
 * Commit attendance. `marksByRef` maps the opaque roster index → present/absent.
 * `expectedRosterSize` guards against a roster edited mid-session (refs would
 * shift): mismatch → roster_changed so the page reloads.
 */
export async function submitEnsembleAttendance(args: {
  token: string;
  marksByRef: Record<number, Mark>;
  expectedRosterSize?: number;
  day?: string;
  now?: Date;
  nowHHMM?: string;
  force?: boolean;
}): Promise<SubmitResult> {
  const now = args.now ?? new Date();
  const day = args.day ?? getTodayDate();
  const v = await validateEnsembleToken(args.token);
  if (!v) return { ok: false, reason: 'not_found' };

  // Server is the source of truth for which period this is — the client never
  // picks it. A scheduled rehearsal wins; otherwise the taker can `force` open
  // the current clock hour. No rehearsal and no force → reject so a stale tab
  // can't file into the wrong slot.
  const nowHHMM = args.nowHHMM ?? getCurrentTimeHHMM(now);
  const cur = (await resolveCurrentPeriod(v.ensemble, nowHHMM)) ?? (args.force ? forcedPeriodFor(nowHHMM) : null);
  if (!cur) return { ok: false, reason: 'no_rehearsal' };

  const roster = idSorted(await getEnsembleRoster(v.ensemble));
  if (typeof args.expectedRosterSize === 'number' && args.expectedRosterSize !== roster.length) {
    return { ok: false, reason: 'roster_changed' };
  }

  // Map validated refs → studentId, accepting ONLY in-range refs + present/absent.
  const nextMarks: Record<string, Mark> = {};
  const studentById = new Map<string, Student>();
  for (const [refStr, mark] of Object.entries(args.marksByRef)) {
    const ref = Number(refStr);
    if (!Number.isInteger(ref) || ref < 0 || ref >= roster.length) continue;
    if (mark !== 'present' && mark !== 'absent') continue;
    const s = roster[ref]!;
    nextMarks[s.id] = mark;
    studentById.set(s.id, s);
  }

  const subRef = adminDb.collection(SUBMISSIONS).doc(docId(args.token, day, cur.slot_key));
  const casesCol = adminDb.collection(CASES_COLLECTION);
  const eventsCol = adminDb.collection(EVENTS_COLLECTION);
  const nowIso = now.toISOString();
  const actor = `ensemble:${v.ensemble}`;

  // ATOMIC read-modify-write: the dedup decision (does this kid already have a
  // case?) and the case creation + submission write must be one transaction, or
  // two concurrent submits (a double-tapped phone, a retry on flaky dorm wifi)
  // can both read "no case", both file a report, and the second write clobbers
  // the first's case-id map — orphaning a report. Firestore retries the closure
  // on contention, so the loser re-reads the winner's marks and dedups. The
  // closure is side-effect-free except via `t.*` writes (safe to re-run).
  const tally = await adminDb.runTransaction(async (t) => {
    const snap = await t.get(subRef);
    const existing = snap.exists ? (snap.data() as SubmissionDoc) : null;
    const prevMarks = existing?.marks ?? {};
    const caseIds: Record<string, string> = { ...(existing?.case_ids ?? {}) };
    let newlyAbsent = 0;
    let arrived = 0;

    for (const [studentId, mark] of Object.entries(nextMarks)) {
      const prev = prevMarks[studentId];
      const hasCase = Boolean(caseIds[studentId]);

      if (mark === 'absent' && !hasCase) {
        // New absence → file a report (dedup: only when no case yet for this kid).
        const s = studentById.get(studentId)!;
        const caseRef = casesCol.doc();
        t.set(
          caseRef,
          buildCaseDoc(
            {
              student_id: s.id,
              student_name: `${s.first_name} ${s.last_name}`.trim(),
              summary: `Absent from ${v.ensemble}`,
              raw_text: `Marked absent in ${v.ensemble} attendance${v.label ? ` by ${v.label}` : ''}.`,
              reporter_name: v.label || `${v.ensemble} attendance`,
              session_label: `${v.ensemble} · ${cur.period_name}`,
              session_id: cur.session_id,
              period_id: cur.period_id,
              period_number: cur.period_number,
              dorm_building: s.dorm_building ?? null,
              dorm_room: s.dorm_room ?? null,
              instrument: s.instrument ?? null,
              division: s.division ?? null,
              occurred_at: nowIso,
              source: 'ensemble_attendance',
              created_by: actor,
            },
            nowIso
          )
        );
        t.set(eventsCol.doc(), buildEventDoc(caseRef.id, 'report_received', `Absent from ${v.ensemble}`, actor, nowIso));
        caseIds[studentId] = caseRef.id;
        newlyAbsent++;
      } else if (mark === 'present' && hasCase && prev === 'absent') {
        // Was absent, now present → showed up late. Update the existing report once.
        const caseId = caseIds[studentId]!;
        t.update(casesCol.doc(caseId), { tardy_arrived: true, last_activity_at: nowIso });
        t.set(eventsCol.doc(), buildEventDoc(caseId, 'note', `Arrived in ${v.ensemble} — tardy.`, actor, nowIso));
        arrived++;
      }
    }

    const mergedMarks = { ...prevMarks, ...nextMarks };
    const payload: SubmissionDoc = {
      token: args.token,
      ensemble: v.ensemble,
      day_key: day,
      period_number: cur.period_number,
      period_name: cur.period_name,
      marks: mergedMarks,
      case_ids: caseIds,
      submitted_at: existing?.submitted_at ?? nowIso,
      updated_at: nowIso,
      roster_size: roster.length,
    };
    t.set(subRef, payload);
    const absentCount = Object.values(mergedMarks).filter((mk) => mk === 'absent').length;
    return { newlyAbsent, arrived, absentCount };
  });

  return {
    ok: true,
    absent_count: tally.absentCount,
    arrived_count: tally.arrived,
    newly_absent: tally.newlyAbsent,
  };
}
