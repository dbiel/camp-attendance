# Design: Office-marked (excused) absences

**Date:** 2026-06-29
**Status:** Approved (David, 2026-06-29)
**Repo:** `camp-app` (TTU BOC incident command center)

## Summary

Let the office (admin) proactively mark a student absent for a clock-time
window. During that window the absence surfaces on the ensemble manager's
normal `/e` roster — the student's row is **pre-marked Absent with a note** —
and it **never becomes an incident** on the admin's active board. If the student
shows up and the manager taps Present, the office-absence clears quietly (no
alert). After the window's end time it reverts automatically.

This is the reverse direction of the existing flow: today a *manager* marks a kid
absent (which files an incident); this lets the *admin* tell the manager a kid is
out, without generating an incident.

## Decisions (locked with David 2026-06-29)

- **Meaning:** an excused / known absence. Shows on the manager's normal
  present/absent list (not the "Needs attention" incident pin), auto-marked
  Absent, with a note. Does **not** create an incident on the admin's end.
- **Window:** a clock-time `from`–`until` (today, camp-tz).
- **Arrival:** if the manager taps Present during the window, the office-absence
  **clears quietly** — no notification to the admin, no incident either way.
- **No incident record at all** for office-absences; the `marked_absences` list
  is the admin's record. **No cron** — "covering now" is computed.
- **Optional reason note**; blank defaults to "Marked absent by office."

## Non-goals

- No recurring / multi-day absences (single clock window, today).
- No notification/alert to the admin on arrival (explicitly quiet).
- No schema change to `cases`; office-absences are a separate collection.
- No background job — expiry at `until` is computed at read time.

---

## Data model

New Firestore collection **`marked_absences`** (Admin SDK only; rules
`read: if false` like the rest):

```ts
interface MarkedAbsence {
  id: string;
  student_id: string;
  student_name: string;   // denormalized for the admin list + manager note
  date: string;           // 'YYYY-MM-DD', camp-tz day it applies to
  from: string;           // 'HH:MM' camp-tz, inclusive
  until: string;          // 'HH:MM' camp-tz, exclusive
  note: string | null;    // optional reason; null → default text shown
  status: 'active' | 'cleared';
  cleared_at: string | null;
  cleared_reason: 'arrived' | 'manual' | null;
  created_by: string;     // admin email
  created_at: string;     // ISO
}
```

**"Covering now"** (the live condition) = `status === 'active'` AND
`date === today` AND `from <= now < until`, all in camp-tz, where `now` honors a
`?now=HH:MM` test override. Expiry after `until` is purely computed — the doc is
left `active` (a nightly/lazy cleanup is out of scope; stale docs simply stop
covering). Manual Clear and arrival set `status='cleared'`.

---

## Components & data flow

### A. `lib/marked-absences.ts` (new)
Pure-ish data layer over the collection (Admin SDK):
- `createMarkedAbsence(input): Promise<string>` — validates `from < until`,
  writes the doc, returns id.
- `listMarkedAbsences(date): Promise<MarkedAbsence[]>` — all for a day
  (admin list; newest-first).
- `activeMarkedAbsenceStudentIds(studentIds, nowHHMM, date): Promise<Map<string, MarkedAbsence>>`
  — for a set of roster students, the ones with an absence **covering now**
  (used by the `/e` GET and the submit path). One `in`-batched query on
  `student_id` filtered to `date` + `status==='active'`, then covering-now
  filtered in code.
- `clearMarkedAbsence(id, reason): Promise<void>` — sets `status='cleared'`,
  `cleared_at`, `cleared_reason`.
- `clearActiveAbsenceForStudent(studentId, nowHHMM, date, reason): Promise<void>`
  — used on arrival from the submit path.

### B. Admin API (new routes, `withAuth('lookup_admin')`)
- `POST /api/marked-absences` `{ student_id, student_name, from, until, note? }`
  → `createMarkedAbsence`. 400 on bad window/missing student.
- `GET /api/marked-absences?date=YYYY-MM-DD` → `{ absences: MarkedAbsence[] }`
  (defaults to today). For the admin list.
- `DELETE /api/marked-absences/[id]` → `clearMarkedAbsence(id, 'manual')`.

### C. Admin UI — `app/admin/cases/MarkAbsent.tsx` (new) + page wiring
- A **"Mark absent"** button on `app/admin/cases/page.tsx` next to "+ New
  report". Opens a small inline form:
  - **Student** — the shared `StudentPicker` (see Refactor below).
  - **From** / **Until** — time inputs (`<input type="time">`), camp-tz HH:MM.
  - **Note** — optional text.
  - Submit → `POST /api/marked-absences` → refresh the list, close.
- A compact **"Marked absent (today)"** list under the button: each active
  covering-or-upcoming absence as `Name · out HH:MM–HH:MM · note` with a
  **Clear** button (`DELETE`). This is the admin's record/management surface.
  Polls with the existing hub refresh or its own light interval.

### D. Refactor — extract `StudentPicker`
`StudentPicker` is currently a private component inside
`app/admin/cases/NewReport.tsx`. Extract it to
`app/admin/cases/StudentPicker.tsx` (unchanged behavior/props), import it in
both `NewReport` and `MarkAbsent`. This is the minimal change that serves the
goal — no behavior change to NewReport.

### E. `/e` roster surfacing
- `GET /api/e/[token]` (`app/api/e/[token]/route.ts`): after the roster is
  built, call `activeMarkedAbsenceStudentIds(rosterStudentIds, now, today)` and
  return a `marked_absent` map keyed by the **opaque ref** (same index scheme as
  `incident_refs`): `{ [ref]: { note: string; until: string } }` where `note`
  is the reason or the default text. No student_id leaks (ref only).
- `app/e/[token]/page.tsx`: extend `LoadData` with `marked_absent`. In the
  mark-initialization effect, after defaulting everyone to `present` and before
  overlaying the prior submission, set each `marked_absent` ref's default to
  `'absent'` (a prior submission still wins — the manager's saved action is
  authoritative). Render the note inline on the row (e.g. a small amber line
  *"Office: out until 2:30 — doctor appt"*). The row stays in its instrument
  group; Present/Absent remain tappable (Present = arrival).

### F. Submit path — suppression + arrival-clear
`app/api/e/[token]/submit/route.ts` + `lib/ensemble-attendance.ts`
(`submitEnsembleAttendance`, case creation at `:307`):
- The route resolves the **covering-now office-absence student_ids** for the
  roster (camp-tz `now`, honoring `?now=`) and passes that set into
  `submitEnsembleAttendance`.
- **Suppress incident:** in the `mark === 'absent' && !hasCase` branch, also
  skip case creation when the student is in the office-absence set. The
  submission still records them absent in `ensemble_attendance`; no `case` is
  written. (Normal absences without an office-absence file incidents as today.)
- **Arrival clear:** when `mark === 'present'` and the student has a covering
  office-absence, call `clearActiveAbsenceForStudent(..., 'arrived')`. Quiet —
  no event, no incident, no admin alert.

---

## Edge cases

- **Multiple ensembles:** the window is per-student and clock-based, so it shows
  on any ensemble roster live during the window — correct (the kid is out).
- **Idle/greyed roster:** office-absence only matters when the roster is active
  (rehearsal or forced); the greyed idle view is unaffected.
- **Window passed:** `from <= now < until` fails → not returned, not
  suppressing, row normal. No cleanup needed.
- **Admin marks the wrong window:** Clear button removes it.
- **`?now=` testing:** GET and submit both already honor `?now=HH:MM`; the
  covering-now check uses the same override.
- **Bad input:** `from >= until` or missing student → 400.

## Security / privacy

- `marked_absences` is Admin-SDK-only (`read: if false`); the public `/e` routes
  expose only the ref-keyed `{ note, until }` map — never student_id, never the
  full record. `note` is admin-authored free text (the admin controls what the
  manager sees). Admin create/list/delete go through `withAuth('lookup_admin')`.

## Testing

- `lib/marked-absences.ts`: covering-now logic (in/out of window, wrong day,
  cleared status, `?now=`), `from < until` validation, arrival/manual clear.
- Admin routes: create 400s on bad window; list returns today; delete clears.
- `/e` GET: `marked_absent` map keyed by ref; no student_id in payload.
- Submit: an absent + office-marked student files **no** case; an absent
  non-marked student still files one; a present office-marked student gets the
  absence **cleared** and no case.
- Page: a `marked_absent` ref initializes to Absent and shows the note; a prior
  submission mark overrides the default.

## Risks

- **A suppressed absence hides a genuinely-missing kid.** Mitigated: suppression
  only applies to a kid the admin explicitly marked out for a bounded window;
  outside the window normal incident-filing resumes; the admin's marked-absent
  list shows what's active.
- **`ref` drift** between GET and submit — both re-derive the same id-sorted
  roster via `getRosterForToken` (same invariant the incident routes rely on).
