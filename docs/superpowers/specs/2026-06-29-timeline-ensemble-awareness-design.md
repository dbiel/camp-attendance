# Design: Timeline edits, ensemble awareness, hourly archive, newest-first

**Date:** 2026-06-29
**Status:** Approved (David, 2026-06-29)
**Repo:** `camp-app` (TTU BOC incident command center)

## Summary

Four independently-shippable phases extending the incident command center:

1. **Add to the timeline from the admin case** — a note/comment box on the case
   detail page.
2. **Ensemble roster → student incident layer** — on the public `/e/<token>`
   ensemble page, students with an active incident badge + pin to the top; tapping
   one opens a layer showing their incident timeline and a two-way "add update"
   box (mirrors the `/r` staff link).
3. **Hourly archive** — resolved incidents already drop to history; still-active
   incidents stay on the board but split into "This hour" vs "Carried over" once
   their clock hour passes. No auto-resolve, no cron.
4. **Newest on top** — flip the active board (currently oldest-first) and other
   lists to newest-first, keeping an elapsed/urgency badge so a long-missing kid
   still reads as urgent.

## Context / current state

- Case detail: `app/admin/cases/[id]/page.tsx` already has a `logEvent('note', …)`
  helper and the `/api/cases/[id]/events` route already accepts a `note` event —
  there is no UI to type one.
- Public ensemble page: `app/e/[token]/page.tsx` + `GET /api/e/[token]` return a
  scoped roster (`toEnsembleRosterProjection` — name/instrument/grade + opaque
  `ref` that is the index into the server's id-sorted roster, stable between GET
  and submit). No way to see a student's incident.
- Staff link: `app/r/[token]/page.tsx` + `GET/POST /api/r/[token]` are already the
  exact "see incident timeline + status + post a two-way update" pattern, using
  `toStaffLinkProjection` (allowlist: first name + last initial, instrument, dorm,
  summary, status, `staff_update` events only) and an opaque `ref`.
- Active hub: `app/admin/cases/page.tsx` sorts **oldest-first on purpose**
  ("most urgent / longest elapsed first"); `CaseCard` shows escalating elapsed.
- History: `ReportHistory` groups resolved/active by day → hour (camp-tz, via
  `lib/date.ts` `hourBucket`/`periodInstant`/`formatClock`).
- Cases: `lib/cases.ts`. `Case.occurred_at` is always set. `addCaseEvent` bumps
  `last_activity_at`. `listCases('active')` returns all active cases (small set).

## Decisions (locked with David 2026-06-29)

- **Still-active at end of hour:** keep on the active board, flag "carried over."
  Resolved ones drop to history. Never auto-hide or auto-resolve a missing kid.
- **Ensemble layer scope:** incident layer for **flagged students only** (those
  with an active incident). Shows status + summary + timeline + add-update box.
- **Ensemble layer privacy:** **no dorm/room** shown to ensemble leaders
  (awareness, not locating). Status + summary + timeline only.
- **Flagged students on the roster:** pinned to a "Needs attention" section
  **above** the instrument groups, AND remain in their instrument group for
  attendance marking (not removed).
- **Sort:** newest-on-top everywhere, **keep the elapsed/urgency badge** on
  carried-over cards.

---

## Phase 1 — Add to the timeline (admin)

**Goal:** Office can add a free-text note/comment to a case's timeline.

**Changes** (UI only; no API/schema change):
- `app/admin/cases/[id]/page.tsx`: under the **Timeline** heading add a textarea +
  "Add to timeline" button. On submit, call the existing
  `logEvent('note', text.trim())` then clear the box. Show for **active and
  resolved** cases (annotations are useful post-resolution too). Disable the
  button while empty/posting; surface a small inline error on failure.

**Data flow:** `POST /api/cases/[id]/events { type:'note', body }`
(`withAuth('lookup_admin')`, already allows `note`) → `addCaseEvent` writes the
event + bumps `last_activity_at` → hub badges "updated" on next poll.

**Tests:** component-level — empty disables, submit posts and clears. (Route is
already covered.)

---

## Phase 2 — Ensemble roster → student incident layer

**Goal:** On `/e/<token>`, a leader sees which of their students have an active
incident, can open a layer with the incident timeline, and can post updates back
to the office.

### API

1. **`GET /api/e/[token]` (extend):** after deriving the roster, read
   `listCases('active')` (small set), filter to cases whose `student_id` is in the
   roster, and attach a per-row marker. Add to each `EnsembleRosterRow` (or a
   parallel map keyed by `ref`): `incident: { active: true } | null`. Only the
   boolean/flag — no incident detail in the list payload.

2. **`GET /api/e/[token]/incident/[ref]` (new):** validate token (uniform 404),
   re-derive the **same id-sorted roster** via `getRosterForToken`, map `ref` →
   `roster[ref]` → `student.id`, find that student's active case
   (`listCasesForStudent(id)` → first `status==='active'`), return a scoped
   projection. **No dorm** for the ensemble audience: a new
   `toEnsembleIncidentProjection(c, student, events)` = first name + last initial,
   instrument, status, summary, `staff_update` events (neutral "Camp staff"
   author), **omitting `dorm_building`/`dorm_room`**. Uniform 404 if ref out of
   range / no active case. Rate-limited (`e:<ip>`).

3. **`POST /api/e/[token]/incident/[ref]/update` (new):** validate token, map ref
   → active case (re-derive server-side; never trust a client id), require a
   non-empty body, `addCaseEvent(caseId, 'staff_update', body, actor)` where
   `actor` is the ensemble label (e.g. `"Band 5"`). 410 if the case is no longer
   active. Rate-limited. Mirrors `POST /api/r/[token]/update`.

### UI (`app/e/[token]/page.tsx`)

- Roster GET now carries the incident flag per `ref`.
- **"Needs attention" pinned section** above the instrument groups: each flagged
  student as a compact tappable card (🔴 + name). Flagged students still render in
  their instrument group too (for marking).
- Tapping opens the existing `components/Modal.tsx` with a layer that fetches
  `GET /api/e/[token]/incident/[ref]`: status pill, summary, timeline (blue
  staff-update styling like `/r`), and an "Add update…" textarea + Send. The layer
  polls (30s, pause-on-hidden) and flashes "↻ updated from the camp office" on a
  new update, mirroring `/r`.

**Security:** the ensemble token authorizes incident read/update **only for
students in that ensemble's server-derived roster**; `ref` stays the opaque index
(never a student/case id); allowlist projection built field-by-field; no dorm,
medical, parent contact, raw text, or other students. Uniform 404 on bad
token/ref. Per-IP rate limiting. CI egress guard unaffected.

**Tests:** `toEnsembleIncidentProjection` omits dorm and carries only
`staff_update` events; route maps ref→case within the ensemble and 404s a
ref/case outside it; update posts a `staff_update` and 410s a resolved case;
flag appears in the list GET only for in-roster active cases.

---

## Phase 3 — Hourly archive (carried-over flag)

**Goal:** The active board separates the current hour's incidents from older
still-unresolved ones, without ever hiding a missing kid.

**Changes** (display only; no cron, no status change, no schema change):
- `app/admin/cases/page.tsx`: compute the current camp-tz clock hour
  (`lib/date.ts`), honoring `?now=HH:MM`. Partition active cases by whether their
  `occurred_at` falls in the current hour. Render two groups: **"This hour"** then
  **"Carried over"** (older, still active), each newest-first. Carried-over cards
  keep/raise the elapsed badge.
- A pure helper (e.g. `partitionByHour(cases, nowHour)` or reuse `hourBucket`) so
  it's unit-testable.

Resolved incidents continue to leave the active board immediately and appear in
day→hour history — that half of "move to history at end of hour" already works.

**Tests:** partition helper — same-hour vs prior-hour bucketing, DST-safe via
`lib/date.ts`, `?now=` override.

---

## Phase 4 — Newest on top

**Goal:** Most recent incident at the top, everywhere.

**Changes:**
- `app/admin/cases/page.tsx`: reverse the active sort to newest-first
  (`occurred_at` desc), applied within each Phase-3 group. Keep `CaseCard`'s
  elapsed/urgency badge so a long-missing kid still reads as urgent.
- Audit + align newest-first: `ReportHistory` hour groups, the case-detail
  "Prior reports" list, and the admin ensemble-attendance grid where a time order
  applies.

**Tests:** sort comparator yields newest-first; carried-over group still ordered
newest-first internally.

---

## Out of scope / non-goals

- No background cron / scheduled function (Phase 3 is display-only).
- No change to the attendance-marking flow or submission keying.
- No dorm/medical/contact exposure added to the ensemble audience.
- No change to `Case` schema or Firestore indexes (server still orders active by
  `created_at`; newest-first ordering and hour partitioning are client-side).

## Risks

- **Privacy creep on a public token.** Mitigation: dedicated allowlist projection
  (no dorm), uniform 404, per-IP rate limit, server-derived roster scoping, unit
  tests asserting the omitted fields.
- **Hiding a missing kid.** Mitigation: Phase 3 never changes status or removes a
  card; carried-over stays visible with an elevated elapsed badge.
- **`ref` drift between GET and the incident endpoints.** Mitigation: both
  re-derive the same id-sorted roster via `getRosterForToken` (same invariant the
  submit path already relies on).
