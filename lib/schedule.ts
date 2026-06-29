/**
 * Pure schedule resolution — no Firestore. Given a student's schedule slots
 * (their ensemble base + electives, each carrying its period's clock window)
 * and the current camp-tz wall-clock time, resolve the Current and Next
 * session. Used by the Students table Current/Next columns and the report-card
 * "now / next" line.
 *
 * "Current" uses STRICT period windows (David's call): if `now` isn't inside a
 * period's [start, end), there is no current session (passing/free/dorm time).
 */

export interface ScheduleSlot {
  session_id: string;
  name: string;
  type: string;
  location: string | null;
  period_number: number;
  start_time: string; // 'HH:MM' camp-local
  end_time: string; // 'HH:MM' camp-local
}

function toMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m) return NaN;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return NaN;
  return h * 60 + mi;
}

export function currentAndNextSession(
  slots: ScheduleSlot[],
  nowHHMM: string
): { current: ScheduleSlot | null; next: ScheduleSlot | null } {
  const now = toMinutes(nowHHMM);
  if (Number.isNaN(now)) return { current: null, next: null };

  const valid = slots
    .filter((s) => !Number.isNaN(toMinutes(s.start_time)) && !Number.isNaN(toMinutes(s.end_time)))
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

  let current: ScheduleSlot | null = null;
  let next: ScheduleSlot | null = null;
  for (const s of valid) {
    const st = toMinutes(s.start_time);
    const en = toMinutes(s.end_time);
    if (st <= now && now < en) current = s; // strict window
    if (st > now && next === null) next = s; // earliest start after now
  }
  return { current, next };
}

/** Compact label for the Next column / now-next line: "Lunch · 12:00 · Room"
 * (room → "(no room)" when blank, since session.location is often empty). */
export function formatNextLabel(slot: ScheduleSlot | null): string {
  if (!slot) return 'Done for the day';
  const room = slot.location && slot.location.trim() ? slot.location.trim() : '(no room)';
  return `${slot.name} · ${slot.start_time} · ${room}`;
}

export type EnsembleNow =
  | { status: 'rehearsal'; current: ScheduleSlot; next: ScheduleSlot | null }
  | { status: 'no_rehearsal'; current: null; next: ScheduleSlot | null };

/**
 * Resolve an ensemble's CURRENT rehearsal at `nowHHMM` (camp-local). Gates to
 * `type === 'rehearsal'` slots so meals/sectionals/electives never offer
 * attendance. Reuses the strict-window `currentAndNextSession`; `next` is the
 * ensemble's next rehearsal today (drives the "Next: …" line when idle).
 */
export function resolveEnsembleNow(slots: ScheduleSlot[], nowHHMM: string): EnsembleNow {
  const rehearsals = slots.filter((s) => s.type === 'rehearsal');
  const { current, next } = currentAndNextSession(rehearsals, nowHHMM);
  return current
    ? { status: 'rehearsal', current, next }
    : { status: 'no_rehearsal', current: null, next };
}
