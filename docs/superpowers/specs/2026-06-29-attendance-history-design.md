# Attendance History — Design

**Date:** 2026-06-29
**Branch:** `feat/attendance-history` (isolated clone off `main`)
**Status:** Approved design → implementation

## Problem

Admins have no way to see, after the fact, **which ensembles took attendance and
when**. Attendance is submitted from anonymous public `/e/<token>` links; the
office can see the resulting incident reports but not a roll-up of *who took
attendance during which period*. Operationally the office needs an at-a-glance
"who's missing" board: which scheduled rehearsals have **not** had attendance
taken yet.

## Decisions (locked with David)

- **"Who" = the ensemble/class name** (Band/Orchestra). Links are anonymous; no
  human taker identity is captured and none is added. Ensemble name is the
  identity, and it is already on every submission.
- **Both views**, with a `[ Grid | List ]` toggle; **grid is the default**.
- **Day picker, default today**, past periods only.
- **Grid rows = standard ensembles only** (Band 1–7, Orchestra 1–3 via
  `PICKER_ENSEMBLES`). Jazz/non-standard are not grid rows, but their attendance
  still appears in the List view (nothing is hidden).
- **Green cells show an inline absent-count badge.**
- **Ship:** build + test + commit + push the feature branch + open a PR into
  `main` (NOT merged), then `firebase deploy --only hosting` to prod, smoke test.
  **`main` is never touched.**

## Key facts (from codebase exploration)

- Attendance submissions live in **`ensemble_attendance`**
  (`lib/ensemble-attendance.ts`). Doc shape:
  `{ token, ensemble, day_key (YYYY-MM-DD), period_number, period_name, marks,
  case_ids, submitted_at (ISO), updated_at (ISO), roster_size }`.
  Doc id = `` `${token}__${day}__${slotKey}` `` where `slotKey` is `P<n>` for a
  scheduled rehearsal period or `H<hour>` for a force-opened clock hour.
- `periods` collection: `{ id, number, name, start_time 'HH:MM', end_time 'HH:MM' }`,
  camp-local times (`lib/types.ts`, `getPeriods()` in `lib/firestore.ts`).
- Live `sessions` (type `rehearsal`) tell us which ensemble has a rehearsal in
  which period — drives the grey "scheduled but missed" cells.
- Canonical ensemble row order: **`PICKER_ENSEMBLES`** in `lib/ensemble-links.ts`
  (Band 1–7, Orchestra 1–3; Jazz intentionally excluded).
- "Past" = camp wall-clock `now >= period.end_time` for today; all periods of an
  earlier camp day are past. Camp tz `America/Chicago`; `getCurrentTimeHHMM()` /
  `getTodayDate()` in `lib/date.ts`; `?now=HH:MM` override honored.
- Admin read APIs use `withAuth('lookup_admin', handler, { rateLimitKey })`
  (`lib/with-auth.ts`); client passes `headers: await getAuthHeaders()`.
- Nav: Data sub-tabs in `app/admin/layout.tsx` (`SUB_TABS` + `resolveTabs()`).
  Template for a data view + API: `app/admin/data/sessions/` +
  `app/api/admin/ensemble-attendance/route.ts`.

## Scope

A new **read-only** admin view. **No** schema change, **no** new Firestore index,
**no** cron, **no** change to the public `/e` flow.

## UI

### Placement
New **Data sub-tab "Attendance"** at `/admin/data/attendance`, sibling to
Reports / Students / Faculty / Classes. Add one `SUB_TABS` entry + a `resolveTabs`
case in `app/admin/layout.tsx`.

### Day handling
A day picker defaulting to **today** (past periods only). Selecting an earlier
camp day shows all of that day's periods. Future days/periods are never shown.
Available days = the distinct `day_key`s present in `ensemble_attendance`
(plus today), newest first.

### Grid view (default)
Rows = standard ensembles (`PICKER_ENSEMBLES` order). Columns = **past periods
only** for the selected day (header: `P<n> · name · start–end`). Cell states:

- 🟩 **green** — attendance taken for that ensemble+period. Inline absent-count
  badge (e.g. "2 abs", or "✓" when zero absent). Tappable → exact `submitted_at`
  time + `absent_count`/`roster_size`.
- ⬛ **grey** — a rehearsal is scheduled for that ensemble in that (past) period
  but no `ensemble_attendance` doc exists. The "who's missing" signal.
- — **dash** — no rehearsal scheduled for that ensemble that period.

### List view (toggle)
Newest-first, grouped by period (header `P<n> · name · start–end`). Each row =
ensemble + `taken HH:MM` (+ absent count if any). Shows **all** submissions for
the day, including any non-standard ensembles and **force-opened** submissions.

## Data flow / API

New route **`GET /api/admin/attendance-history?day=YYYY-MM-DD`**, wrapped
`withAuth('lookup_admin', …, { rateLimitKey: 'admin-attendance-history' })`,
`export const dynamic = 'force-dynamic'`. `day` defaults to `getTodayDate()`;
`?now=HH:MM` honored for past-determination in testing.

The route is thin; all derivation lives in a pure, unit-testable helper
**`lib/attendance-history.ts`**:

```
buildAttendanceHistory({
  day, today, nowHHMM,
  periods,             // Period[]
  rehearsalSessions,   // {ensemble, period_number}[] from sessions type==='rehearsal'
  submissions,         // ensemble_attendance docs for `day`
  ensembles,           // PICKER_ENSEMBLES (standard grid rows)
}) => {
  day,
  periods: [{ number, name, start_time, end_time }],   // PAST only, ascending
  ensembles: string[],                                 // standard rows
  cells: { [ensemble]: { [periodNumber]: Cell } },
       // Cell = { state:'taken', submitted_at, absent_count, roster_size }
       //      | { state:'missed' } | { state:'none' }
  list: [{ ensemble, period_number, period_name, submitted_at, absent_count,
           roster_size, scheduled:boolean, in_grid:boolean }],  // ALL submissions, newest first
  availableDays: string[],   // distinct day_keys ∪ {today}, newest first
}
```

Derivations:
- **Past filter:** keep a period iff `day < today` OR (`day === today` &&
  `nowHHMM >= end_time`). Emit columns ascending by `number`.
- **Cell:** `taken` if a submission matches ensemble+period_number; else `missed`
  if that ensemble has a rehearsal scheduled that period; else `none`.
- **absent_count** = `Object.values(marks).filter(m => m === 'absent').length`.
- **list** = every submission for the day, mapped + sorted by `submitted_at`
  desc; `in_grid` false for non-standard ensembles or period_numbers with no
  matching past column (e.g. force-opened `H<hour>`).

## Edge cases

- **Force-opened attendance** keys to a clock hour (`period_number` = the hour),
  not a scheduled period. Appears in the **list** (`in_grid:false`); lands in a
  grid cell only if its number coincides with a real past period. UI footnote
  explains grey vs green so a missed cell is never misread.
- **Resubmit:** doc id is deterministic (one doc per ensemble+day+slot), so at
  most one submission per cell.
- **Empty day / no periods:** render an empty-state message, not an error.
- **Ensemble name match** is on the verbatim string; grid rows and link source
  are the same constant, so they align.

## Testing

- TDD on `lib/attendance-history.ts` (pure): past-period filtering (earlier day,
  today before/after end_time, `?now`), three cell states, absent-count
  derivation, force-opened → `in_grid:false`, list ordering, ensemble ordering,
  empty inputs.
- New unit tests follow existing `tests/unit/...` vitest patterns.
- Prod smoke after deploy: `/admin/data/attendance` loads, grid/list toggle,
  day picker, `?now=` forces past periods, a bad-auth request → 401.

## Out of scope / future

- Capturing a real human taker name on the public `/e` flow.
- Wiring the static `lib/master-schedule.ts` (last year's grid); the overlay uses
  live periods + live rehearsal sessions, which join cleanly.
