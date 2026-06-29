# Design: `/e` roster — excused kids up top, incidents as per-row "Previous Report"

**Date:** 2026-06-29
**Status:** Approved (David, 2026-06-29)
**Repo:** `camp-app` (TTU BOC incident command center)

## Summary

Rework the public ensemble roster (`/e/<token>`) surfacing — manager-facing only,
admin side untouched:

1. **"Needs attention" pin → the kids the office excused** (office-marked
   absences), instead of active incidents. They still auto-mark Absent + show
   their inline "Office: out until…" note on the roster row.
2. **Incidents → a per-row "📄 Previous Report" link**, shown on any kid with a
   report **from today** (active *or* resolved) — so the manager knows if the kid
   was reported absent/late in another class today.
3. **The report layer** shows what happened (summary, status incl.
   "Resolved — <note>", timeline) **and keeps** the typed update box (active
   reports) — and the existing tap-Present-then-resubmit "came back" flow is
   unchanged.

Net: incidents move from the top pin down to a per-row reference; the office's
excused kids take the top pin. **Every update capability the manager had is
preserved.**

## Decisions (locked with David 2026-06-29)

- **"Needs attention" pin = office-marked (excused) absences** (`marked_absent`),
  yellow, header "Needs attention — N (excused by office)". Each row: name ·
  out until HH:MM · note. Display-only (no tap target). Excused kids keep
  auto-Absent + inline note on their roster row (unchanged).
- **"Previous Report" appears on a kid with a TODAY report** — active OR resolved
  (camp-tz date of `occurred_at` == today).
- **The report layer keeps the typed update box** (shown only for an active
  report, as today) AND the tap-Present "came back"/tardy-arrival flow is
  untouched. View shows `resolution_note` for resolved reports.

## Non-goals

- No change to the admin incident command center, the office-marked-absences
  admin UI, or `submitEnsembleAttendance`'s suppression / tardy-arrival logic.
- No new Firestore index (today-filtering is computed in code).
- No change to the public route *paths* (`/api/e/[token]/incident/[ref]` and
  `…/update` keep their names to avoid churn; their meaning broadens to
  "today's report").

---

## Components & data flow

### A. `lib/ensemble-incidents.ts`

- **Rename** `listActiveIncidentRefs` → **`listTodayReportRefs(token)`**: roster
  indices whose student has a case **from today** (active OR resolved). Fetch
  `listCases('active')` + `listCases('resolved')`, keep cases whose camp-tz date
  of `occurred_at || created_at` equals `getTodayDate()`, map to the roster ref
  via the same `idToRef` map, dedupe + sort. Returns `null` for an invalid token.
- **Rename** `getEnsembleIncidentByRef` → **`getEnsembleReportByRef(token, ref)`**:
  returns the **most-recent today report** (active or resolved) for the student
  at `ref`, projected. Uses a new `mostRecentTodayCaseFor(studentId)` helper
  (`listCasesForStudent` is already `created_at desc` → first today case).
  Returns `null` for invalid token / out-of-range ref / no today case.
- **Keep** `postEnsembleIncidentUpdate` (unchanged) — it targets the **active**
  case via the existing `activeCaseFor` helper (you can't post to a resolved
  report; the route already 410s on resolved). Both helpers (`activeCaseFor` for
  updates, `mostRecentTodayCaseFor` for the view) coexist.
- Camp-tz "today" check: a small local `campDate(iso) = hourBucket(iso).slice(0, 10)`
  compared to `getTodayDate()` (reuse `lib/date.ts`; no new tz math).

**Perf note:** `listCases('resolved')` returns all resolved cases; today-filtering
is an O(n) in-code pass. Fine at camp scale (a handful of incidents/day). If
resolved volume ever matters, bound later with a `day_key` single-field query —
out of scope here (spec forbids new indexes).

### B. `lib/projections.ts`
- Add **`resolution_note: string | null`** to `EnsembleIncidentProjection` and
  populate it in `toEnsembleIncidentProjection` from `c.resolution_note ?? null`
  (so the view can show "Resolved — found in dorm"). Still an allowlist — no new
  PII (the resolution note is office-authored text like a staff update).

### C. `/e` GET — `app/api/e/[token]/route.ts`
- Replace the `incident_refs` field with **`report_refs`** (call
  `listTodayReportRefs`). The `marked_absent` map already in the payload now
  drives the pin. No other change.

### D. The detail route — `app/api/e/[token]/incident/[ref]/route.ts`
- Call **`getEnsembleReportByRef`** instead of `getEnsembleIncidentByRef`. Same
  uniform-404 / 400 / rate-limit behavior. (Path unchanged.)
- `…/update/route.ts` and `postEnsembleIncidentUpdate` unchanged.

### E. The page — `app/e/[token]/page.tsx`
- `LoadData`: `incident_refs: number[]` → **`report_refs: number[]`**.
- **The pin now reads `marked_absent`** (excused kids), not the report refs:
  - Build `excusedRows` = roster rows whose `ref` is a key of `data.marked_absent`.
  - Render the pinned section when `excusedRows.length > 0`: yellow, header
    **"Needs attention — N (excused by office)"**, each row
    `🟡 {name} · out until {until}{note ? ` · ${note}` : ''}`. Display-only.
- **Per-row "Previous Report" link** in `renderRow`: when
  `reportRefs.has(r.ref)` (built from `data.report_refs`), render
  `📄 Previous Report →` (replacing today's "🔴 incident — view"), opening the
  report layer (`setOpenReportRef(r.ref)` — rename the existing
  `openIncidentRef` state for clarity). The `marked_absent` inline note + the
  auto-Absent default stay exactly as they are.
- The report layer mount stays (the same `StudentIncidentLayer`), keyed on
  `openReportRef`.

### F. The layer — `app/e/[token]/StudentIncidentLayer.tsx`
- Keep the component (and its name) and its fetch of
  `GET /api/e/[token]/incident/[ref]` (now returns the today report) + the
  **typed update box** (rendered only when `incident.status === 'active'`,
  unchanged) + its poll/flash.
- Add a **resolved line** when `incident.status === 'resolved'`: show
  *"Resolved — {resolution_note}"* (the new projection field). Relabel the
  read-only framing as a "Report" (e.g. the empty-timeline text already reads
  fine; minor copy only).

---

## Edge cases

- **Kid both excused AND has a today report:** shows in the excused pin AND has a
  "Previous Report" link on the row — both are valid, no conflict.
- **Resolved report:** layer is view-only (update box hidden, as today) + shows
  the resolution note. A manager can't post to a resolved case (route 410s) —
  unchanged.
- **No today report but an older one:** does NOT surface (today-scoped by design).
- **"Came back" still works:** tapping Present after submitting + re-submitting
  fires the existing tardy-arrival update to the office (`submitEnsembleAttendance`
  unchanged). The layer's typed box is the *additional* free-text channel.
- **`?now=`** is honored by the GET already; today/now derivation reuses it.

## Security / privacy

- Public payload stays ref-keyed: `report_refs` is roster indices only;
  `marked_absent` is `{note, until}` only. The report projection adds only
  `resolution_note` (office-authored), keeping the existing allowlist (first
  name + last initial, instrument, summary, status, staff_update events).
  No student_id, dorm, medical, contact, or raw text. Token scoping unchanged
  (server-derived roster). Uniform 404 / rate limits unchanged.

## Testing

- `listTodayReportRefs`: includes today active + today resolved, excludes
  yesterday's and out-of-roster; `null` on bad token.
- `getEnsembleReportByRef`: returns the most-recent today case (resolved or
  active) with `status` + `resolution_note`; `null` when no today case / bad ref.
- `toEnsembleIncidentProjection`: carries `resolution_note`; still omits PII.
- `/e` GET: returns `report_refs` (today active+resolved, ref-keyed), no
  student_id; `marked_absent` unchanged.
- Page: pin renders from `marked_absent` (excused) not reports; a `report_refs`
  ref shows "Previous Report"; the layer still shows the update box for active.

## Risks

- **Surfacing a resolved report could read as "still a problem."** Mitigated by
  the explicit *"Resolved — <note>"* status line in the layer and the neutral
  "Previous Report" label (not "🔴 incident").
- **Resolved-cases fetch volume** — see Perf note; acceptable at camp scale.
