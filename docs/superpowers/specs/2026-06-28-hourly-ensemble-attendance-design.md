# Hourly-Rolling Ensemble Attendance — Design

**Date:** 2026-06-28
**Branch:** `feat/hourly-ensemble-attendance`
**Status:** Approved, ready for implementation plan

## Problem

Each band/orchestra ensemble (Bands 1–7, Orchestra 1–3, plus Jazz 1–2) already
has a tokenized, no-login attendance link at `/e/<token>` (Phase 6). Today that
link keys attendance by **day** — one roster, one submission per day. David
wants it to be **period-aware**: the attendance-taker should see only the
*current hour's* rehearsal, take attendance for it, and have the sheet **reset
when the next hour begins**. The same link is reused all day. David's admin side
keeps seeing everything (now stamped per period).

## Key facts from the data (`source-data/2026/build/`)

- **10 periods**, 50-minute blocks: `08:00, 09:00, 10:00, 11:00, 12:00, 13:00,
  14:00, 15:00 (Assembly), 16:00, 17:00`. Each has `number`, `name`,
  `start_time`, `end_time` (camp-local `HH:MM`).
- **32 `rehearsal` sessions**, each tying an `ensemble` → `period_number` →
  `location` (room). Several ensembles rehearse multiple, sometimes back-to-back,
  periods (e.g. a morning block + an afternoon block).
- Ensembles present: `Band 1..Band 7` (some with suffixes like "Band 5 HS/MS"),
  `Orchestra 1..3`, `Jazz 1..2`.

## Decisions (from brainstorming)

1. **Rollover unit = clock period.** Every period is its own attendance-taking,
   even mid back-to-back block. A 2-hour rehearsal = two takes.
2. **Gate on the ensemble's real schedule.** The page only offers attendance
   during periods where *this ensemble* has a `rehearsal` session. Outside those
   it shows "No rehearsal right now. Next: <period> · <time>". This prevents
   bogus attendance during meals/free time and uses the real schedule.
3. **Same links.** Keep `/e/<token>`; no re-issuing. Tokens, link management in
   Settings, projection/PII rules all stay as-is.
4. **Roster source unchanged** = the whole ensemble (`getEnsembleRoster`,
   derived from `students.ensemble`). A rehearsal's roster IS the whole ensemble;
   the session only tells us *time / room / whether-now*.
5. **Admin sees everything**, now per period. Absences still flow to the Active
   Reports hub, stamped with the period. Plus a lightweight per-ensemble
   **period × day attendance grid** on the admin side (v1 included).

## Architecture

### A. Current-session resolution (server, pure where possible)

New helper (extend `lib/schedule.ts` or a small `lib/ensemble-period.ts`):

```
resolveEnsembleNow(ensemble, periods, rehearsalSessions, nowHHMM)
  → { status: 'rehearsal',  period, session }      // in a scheduled rehearsal
  | { status: 'no_rehearsal', next: period | null } // camp hours, not rehearsing
```

- "Current period" = the period whose `[start, end)` window contains `now`
  (strict window, consistent with `currentAndNextSession`).
- If that period has a rehearsal session for this ensemble → `rehearsal`.
- Else → `no_rehearsal` with the ensemble's next rehearsal period today (for the
  "Next: …" line).
- Honors the existing `?now=HH:MM` test override.
- Camp-tz + DST handled via existing `lib/date.ts` helpers.

### B. Submission keying — day + period

`lib/ensemble-attendance.ts`:

- `docId(token, day)` → `docId(token, day, periodNumber)` =
  `${token}__${day}__P${periodNumber}`. Each period gets its own
  `SubmissionDoc` (marks, case_ids, roster_size, timestamps). Add
  `period_number` + `period_name` + `session_id` to the doc for the admin grid
  and report stamping.
- `getEnsembleSubmission`, `getRosterForToken`, `submitEnsembleAttendance` take
  the resolved period. Submit is **rejected** (uniform `no_rehearsal`) if the
  server resolves no rehearsal for `now` — the client can't fabricate a period.
- Absence → incident report: pass the resolved `session_id` / `period` into
  `buildCaseDoc` so reports carry the period (the `cases` schema already has
  session/period fields). Two absences in two hours = two reports. Tardy
  (Absent→Present within the same period) behavior is unchanged.

### C. Public GET `/api/e/[token]`

Returns the resolved session context **plus** the period-scoped submission:

```
{ ensemble, label,
  session: { status: 'rehearsal', period_number, period_name,
             start_time, end_time, location } | { status:'no_rehearsal', next:{...}|null },
  roster, roster_size,                       // only when status==='rehearsal'
  submission: { marks_by_ref, locked, submitted_at, updated_at } | null }
```

Uniform 404 for unknown/revoked tokens preserved. Rate-limit unchanged.

### D. Taker page `/e/[token]/page.tsx`

- Header: `Band 1 · Period 3 · 10:00–10:50 · Hemmle` + **live countdown** to the
  period end.
- **Auto-rollover:** a client timer recomputes time-to-next-boundary; at the
  boundary it re-fetches. On a period change: fresh roster, everyone defaults
  Present, previous marks cleared from view. If there were unsaved marks, show a
  one-line notice ("New session started — Period 3 attendance was filed") and
  reset.
- **No-rehearsal state:** a quiet card — "No rehearsal right now. Next: Period 5
  · 1:00" (or "Done for the day"). No roster, no submit.
- Everything else (sort modes, instrument accordion, submit-pulse, tardy
  semantics) preserved.

### E. Admin: period × day grid (v1, lightweight)

In the existing ensemble-attendance admin surface (Settings link mgmt area or
Data ▸ Students ensemble view): per ensemble, a compact grid of
**period (row) × day (col)** showing taken / not-taken + absent count per cell,
linking into the filed reports. Read-only; reuses the per-period submission
docs. If this proves heavier than expected it can ship in a fast-follow without
blocking A–D.

## Edge cases

- **Mid-period submit then rollover:** prior period's submission persists in
  Firestore (admin sees it); taker view resets to the new period.
- **Back-to-back periods (O1 @ P2 & P3):** two independent sessions/submissions;
  taker re-takes. (Chosen behavior.)
- **Clock just outside a window (passing time):** `no_rehearsal` until the next
  rehearsal period starts.
- **Server is source of truth for the period:** client never picks the period;
  submit re-resolves and rejects if it disagrees, so a stale tab can't file into
  the wrong hour.
- **Assembly / lunch periods:** simply have no rehearsal sessions → `no_rehearsal`.

## Testing

- Unit: `resolveEnsembleNow` across boundaries (start, mid, end-exclusive,
  passing time, before first / after last rehearsal, back-to-back blocks, DST),
  with `?now=` overrides.
- Unit: `docId` keying + submit rejection when `no_rehearsal`; per-period
  report stamping; tardy within a period; idempotent re-submit.
- Existing 508-test suite stays green; no-external-egress guard untouched.
- Prod smoke: public token routes still 404/410 on bad/revoked; viewer 200;
  anon Firestore read of camper data still 403.

## Out of scope (v1)

- Electives links (explicitly deferred by David).
- Changing how links are issued/revoked.
- Notifications/contact of any kind (no-contact rule stands).
