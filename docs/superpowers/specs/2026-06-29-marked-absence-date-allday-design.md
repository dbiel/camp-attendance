# Design: Mark-absent date picker + all-day toggle

**Date:** 2026-06-29
**Status:** Approved (David, 2026-06-29 — auto-approved through the spec gate)
**Repo:** `camp-app` (TTU BOC incident command center)

## Summary

Extend the office "Mark absent" form so an absence can be set for a **specific
date** (default today) and optionally **all day** (no time window). The admin
list shows today + upcoming absences (date-labeled) so a scheduled absence can be
reviewed/cleared early. The `/e` roster needs no logic change — its covering-now
check is already date-scoped, so a future-dated absence simply activates on its
day; an all-day one reads "out all day."

## Decisions (locked with David 2026-06-29)

- **Date picker** on the form, default today, **min = today** (no past dates).
- **All-day toggle:** when on, the From/Until window is hidden and the absence
  covers the whole day.
- **Admin list = today + upcoming**, each item date-labeled with its Clear button.

## Non-goals

- No change to the `/e` covering-now logic, suppression, or tardy-arrival flow.
- No recurring absences (single date).
- No new Firestore composite index (upcoming list filtered in code).

---

## Data model

`marked_absences` doc gains one field:

```ts
all_day: boolean;   // true → whole-day absence; from/until are '00:00'/'23:59'
```

- For an all-day absence, the server stores `from='00:00'`, `until='23:59'`,
  `all_day=true`. **Covering-now is unchanged** — `00:00 <= now < 23:59` covers
  every realistic camp rehearsal hour. `all_day` drives DISPLAY only (so the UI
  reads "All day" instead of "00:00–23:59" / "out until 23:59").
- For a timed absence, `all_day=false` and `from`/`until` are the picked window.
- `date` already exists on the doc (camp-tz `YYYY-MM-DD`).

---

## Components & data flow

### A. `lib/marked-absences.ts`
- Add `all_day: boolean` to `MarkedAbsence` and `CreateMarkedAbsenceInput`
  (`all_day?: boolean`).
- **`createMarkedAbsence`** changes:
  - Validate `date` via a new pure `validDate(date, today)` = `/^\d{4}-\d{2}-\d{2}$/`
    AND `date >= today` (string compare; throws `'bad_date'` otherwise). The
    `today` arg defaults to `getTodayDate()`.
  - If `input.all_day`, set `from='00:00'`, `until='23:59'`, `all_day=true`
    (ignore any client window). Else keep the window + run `validateWindow`
    (throws `'bad_window'` as today). Store `all_day` (default `false`).
- Add **`listUpcomingMarkedAbsences(): Promise<MarkedAbsence[]>`**: query
  `status == 'active'` only, filter `date >= getTodayDate()` in code, sort by
  `date` then `from`. (Equality-only Firestore query — no composite index; the
  date range is an in-code pass over the small active set.)
- `activeMarkedAbsencesForStudents` / `isCovering` / `filterCoveringForStudents`
  unchanged (date-scoped already).

### B. Admin routes — `app/api/marked-absences/route.ts`
- **POST:** also read `date` (string) and `all_day` (boolean). Validate:
  student fields as today; `validDate(date)` → 400 if bad; if NOT `all_day`,
  require a valid `from`/`until` window (`validateWindow`) → 400; if `all_day`,
  the window is not required. Pass `date`, `all_day` (+ window when timed) to
  `createMarkedAbsence`.
- **GET:** when no `?date=` is given, return **upcoming**
  (`listUpcomingMarkedAbsences()`); keep `?date=YYYY-MM-DD` → `listMarkedAbsences(date)`
  for a specific day. (The admin list calls it with no `?date`.)
- DELETE unchanged.

### C. Admin form — `app/admin/cases/MarkAbsent.tsx`
- Add a **date** `<input type="date">` (default `getTodayDate()` camp-tz, `min`
  = today) and an **"All day"** checkbox.
- When "All day" is checked, hide the From/Until inputs. Save is enabled when:
  student selected AND date set AND (`all_day` OR a valid from<until window).
- POST body becomes `{ student_id, student_name, date, all_day, from?, until?, note }`
  (omit `from`/`until` when all-day, or send them — the server ignores them for
  all-day).
- **The list** (today + upcoming) renders each item with a **date label**
  (`Today` / weekday+date) + the window text (**"All day"** when `all_day`, else
  `from–until`) + Clear. The `Absence` row interface gains `date` + `all_day`.
  A small `dayLabel(date, today)` helper formats the date (reuse the camp-tz
  pattern from `ReportHistory`'s `dayLabel`).

### D. `/e` roster surfacing — `app/api/e/[token]/route.ts` + `app/e/[token]/page.tsx`
- The GET's `marked_absent` map gains `all_day`: `{ note, until, all_day }`
  (still ref-keyed, no PII). Built from the covering absence's `all_day`.
- The page's inline note + the "Needs attention" pin read it: show
  **"Office: out all day"** when `all_day`, else the existing
  **"Office: out until {until}"**. Auto-Absent default unchanged.

---

## Edge cases

- **All-day covering-now:** `00:00–23:59` covers all camp hours; the greyed idle
  roster outside rehearsals is unaffected.
- **Past date:** rejected at the form (`min`) and the API (`validDate`).
- **Future-dated timed absence:** stored; activates on its date via the existing
  date-scoped covering check; visible in the upcoming list meanwhile.
- **All-day + a client-sent window:** server ignores the window and forces
  `00:00`/`23:59`.

## Security / privacy

- `marked_absences` stays Admin-SDK-only; the `/e` `marked_absent` map adds only
  the boolean `all_day` (no PII). Admin routes stay `withAuth('lookup_admin')`.
  `date` is validated server-side (format + not past).

## Testing

- `validDate`: valid/today/future pass; past + malformed fail.
- `createMarkedAbsence`: all-day forces `00:00`/`23:59` + `all_day=true`; timed
  validates the window; bad date throws.
- `listUpcomingMarkedAbsences`: includes today + future active, excludes past +
  cleared, sorted by date then from.
- POST route: 400 on past date; all-day create without a window succeeds; timed
  create still requires a window.
- `/e` GET: `marked_absent` carries `all_day`, still no student_id.
- Form/list: all-day hides the window; the list shows the date label + "All day".

## Risks

- **`23:59` exclusive misses the final minute of an all-day window** — immaterial
  (no camp rehearsal runs 23:59–00:00); `all_day` display avoids any user-visible
  oddity.
