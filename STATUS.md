# Camp App — STATUS

> **Read this first.** Canonical orientation for the TTU BOC camp app. The top
> block is volatile and refreshed each session; everything below is stable
> reference. If a fact here contradicts the code, trust the code and fix this file.

---

## As of 2026-06-30 (Session 11) — BUGFIX: `/e` "Previous Report" modal invisible (Tailwind purge) — DEPLOYED

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24, `FUNCTIONS_DISCOVERY_TIMEOUT=60`; branch `feat/incident-split-view` @ `cef824d`, **NOT merged to main** — prod still ahead of main). **616 unit tests** (unchanged — config-only fix), tsc clean. `origin/main` unchanged at `7efbd17` → clean additive deploy. **Verified live in-browser:** tapping "📄 Previous Report →" on the `/e` roster now opens the student incident modal (overlay at viewport 0,0 full-screen; title/status/timeline/update box all render).

- **Symptom (David's report):** attendance-takers tap a kid's "📄 Previous Report →" link on `/e/<token>` and **nothing happens** — no popup, no dim.
- **Root cause:** `tailwind.config.ts` `content` only globbed `./app/**`. The shared modal lives in **`components/Modal.tsx`** (outside that path), so Tailwind **purged every utility used only there** — `inset-0`, `z-50`, `bg-opacity-50`, `max-w-2xl`, etc. Classes that also appear under `app/` (`fixed`, `flex`) survived, so the overlay got `position:fixed` **without `inset-0`** → it fell to its in-flow static position **~6286px down the page**, invisible. (Confirmed: no `.inset-0` rule in the shipped CSS; forcing `inset:0` snapped the modal to the viewport.)
- **Fix (`cef824d`):** added `./components/**/*` and `./lib/**/*` to Tailwind `content`. Rebuilt → `.inset-0{inset:0}`, `.z-50{z-index:50}`, `bg-opacity-50` now compile. **This also un-breaks every other `components/Modal` use** (admin StudentDetailModal, Toast, `lib/*.tsx`) that silently lost the same utilities.
- **Scope:** purely a CSS-build/config fix; **no app logic, schema, index, cron, or rules change**. The data layer + API were always correct (all `report_refs` returned 200).

### Follow-on (same session, `eaceccf`) — full report timeline + mobile Back button — DEPLOYED & verified live

After the modal was visible, David flagged two more gaps; both fixed, deployed, and browser-verified in prod (Band 3 token).

- **Timeline was empty.** `toEnsembleIncidentProjection` exposed **only `staff_update` events** (4 across 40 cases) → almost every report showed "No updates yet." Now it builds a **full director-facing timeline** (`EnsembleTimelineEntry[]`, field renamed `updates`→**`timeline`**): `report_received` + `note` + `staff_update` + `resolved`/`reopened`, oldest-first, each with a kind/label + per-kind color rail. **`parent_texted`/`dorm_staff_texted` stay excluded** (contact PII). **Author sanitized** via `ensembleActor()` — `ensemble:<name>` → the ensemble name, everything else (incl. admin emails) → **"Camp office"** (an admin email must never reach the anonymous link). David chose "everything incl. staff notes" (notes ARE shown). `StudentIncidentLayer` renders the rail; `prevCount` flash now keys off `timeline.length`.
- **Mobile Back left the page.** The shared `components/Modal.tsx` had **no close control**, so on the full-screen mobile sheet the phone/browser Back button navigated to the **ensemble picker** (`/e/pick`). Fix: (1) added a **"✕ Close"** button to the Modal header (`data-modal-close`, excluded from initial autofocus so the focus test/behavior is unchanged — benefits all 10 Modal call-sites); (2) `StudentIncidentLayer` **pushes a history entry on open** and closes on `popstate`, with every close path routing through `history.back()` so Back **closes the layer and returns to the roster** (verified: Back → `dialogs 1→0`, URL stays `/e/<token>`). 
- **Tests:** **619 unit** (+3), tsc clean. Projection tests rewritten for the timeline + PII/author assertions; `student-incident-layer` test covers the new shape + the Back-button (`history.pushState`/`history.back`) path.

---

## As of 2026-06-30 (Session 10b) — Incident split view + attendance current-hour + multi-day absence + reversible "Remove from camp" — DEPLOYED

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (two deploys this session: the 4 features, then the history-left layout fix `644e493`; local `firebase deploy --only hosting`, Node 24, `FUNCTIONS_DISCOVERY_TIMEOUT=60`; branch `feat/incident-split-view` @ `644e493`, **NOT merged to main** — prod is ahead of main). **616 unit tests** (+6), tsc + eslint clean. `origin/main` unchanged at `7efbd17` → clean additive deploys. Prod smoke green: `/admin/cases` 200, `/admin/data/{students,attendance}` 200, `/api/marked-absences` 401, `/e` 404. **No new index, no cron, no rules change** (`marked_absences` admin-SDK-only; `withdrawn` writes via Admin SDK bypass rules).

- **Incident desktop split view** (`CaseCard` + new shared `app/admin/cases/CaseDetailView.tsx`): on `lg`+ (≥1024px) a report opens in a **right-hand panel** instead of navigating; Active Reports list stays left, divider + "→ Name" header + ✕ Close. `[id]/page.tsx` is now a thin wrapper (`<CaseDetailView variant="page">`) so mobile + deep links keep the full-page flow. Resolving in-panel clears + refreshes the board; prior-report taps stay in the panel. The **report history + selection bar live in the left column** (with the active reports), so an open report never pushes history full-width — the panel stays sticky/pinned on the right while the left scrolls.
- **Attendance history shows the current hour** (`lib/attendance-history.ts` + `AttendanceHistoryView.tsx`): grid now includes the **in-progress** period (`now` badge); scheduled-but-unsubmitted live cell = **`pending`** (amber …) vs `missed` (gray —). New `isInProgress` + `AttendancePeriod.in_progress` + cell state `'pending'`.
- **Multi-day mark-absent + hour defaults** (`lib/marked-absences.ts` + route + `MarkAbsent.tsx`): `MarkedAbsence.end_date?` (optional/legacy-tolerant); covers `[date, end_date]`. `listMarkedAbsences` now queries active-only + filters range in code (a range that started earlier still applies today; no composite index). Form has Start+End date; **From defaults to the current whole hour** (10:32→10:00–11:00) and snaps to whole hours (minutes ignored).
- **Reversible "Remove from camp"** (`Student.withdrawn`/`withdrawn_at`/`withdrawn_by`, server-stamped in `PUT /api/students/[id]`): a control on the Mark-absent panel withdraws a student → filtered out of `getEnsembleRoster` (`/e`), `listEnsembles` counts, `getSessionStudentsFull`, `searchStudents` (pickers), and `getDailyStats` totals. Record + history kept. **Data ▸ Students** has a "Show removed (N)" toggle + per-row **Restore**.
- **⚠️ For David to verify interactively** (login): the four flows above. **Concurrent-session note:** the split-view commit `d4f2247` (`git add -A`) absorbed the Session-10 Band-7 STATUS entry below — preserved, that session was data-only (no code).

---

## As of 2026-06-30 (Session 10) — Band 7 roster data edits (3 new students + 1 ensemble move) via Admin SDK

**🟢 LIVE in prod Firestore (`ttuboc-attendance`).** No code changes, **no deploy** (app reads live Firestore). On branch `feat/incident-split-view` (working tree clean — branch NOT touched; data-only session). All writes via local Admin SDK scripts (FB_* from `.env.local`), pattern: read-only inspect → dry-run → apply → read-back verify. Firestore rules `read:if false` → firebase MCP can't read; must use Admin SDK.

- **3 new students CREATED in `Band 7 MS`** (Firestore auto-ids, avoid colliding with numeric seed ids 1–632):
  - **Kaylee Aguilar-Lanczak** (`Hspos2c0cYuPPKgBf49o`) — Flute. 9 enrollments: B7 base + **Music Theory** (P2, sess 253) + **Flute Choir B6/B7** (P7, sess 242).
  - **Austyn Ybarra** (`MeMP28enmCKii5jeID83`) — Alto Saxophone (David said "sax"; Alto is B7's only sax sectional + matches every existing B7 sax — flagged). 9 enrollments: B7 base + **Music in Film** (P2, sess 239) + **Sax Choir B6/B7** (P7, sess 252).
  - **Jameson Eppler** (`uLf8Lh9YoTPpvCyzhcTc`) — Percussion. B7 base only (7 enrollments), no electives.
- **Band 7 MS base** (per-instrument P5 sectional): P1 reh 29, P3 reh 30, P4 lunch 31, **P5 sectional** (Flute 166 / Alto Sax 87 / Perc 70), P6 reh 33, P8 assembly 34, P9 dinner 35. B7 has **no P2/P7 base** → electives fit with no collision. The "6th period" choir David named resolved to **P7** (the B6/B7 sections are P7; there is no Band-7 choir at P6).
- **Colby Thomson (`567`, Percussion) MOVED Band 7 MS → Band 6 MS** (proper Admin-SDK ensemble move — swapped base, kept electives Beginner Piano P2/250 + Percussion Ensemble B6/B7 P7/260, both still fit; added B6 P6 Percussion sectional 143; 9 enrollments, no collision).
- **No-blind-data honored:** the 3 new students' division/dorm/grade/contacts are **blank** (`division:''`, rest `null`) — fill in-app (Data ▸ Students), do NOT fabricate. If Austyn is Tenor/Bari, just change his `instrument` field (sectional unaffected).

---

## As of 2026-06-30 (Session 9) — Mark-absent DATE PICKER + ALL-DAY shipped; co-deployed with Attendance History (PR #2)

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24, `FUNCTIONS_DISCOVERY_TIMEOUT=60`; branch `feat/marked-absence-date-allday`). **610 unit tests** (+12 from this feature, +12 from PR #2 vs Session 7's 598). Subagent-driven (4 tasks + opus whole-branch review → READY TO MERGE, no Critical/Important). Spec+plan in `docs/superpowers/{specs,plans}/2026-06-29-marked-absence-date-allday*`. **No new index, no cron; covering-now logic unchanged.**

- **⚠️ CONCURRENT-SESSION CO-DEPLOY (important):** this session built the date-picker/all-day feature while a *parallel* session shipped **Attendance History** (PR #2) and had already **deployed it to prod from its branch** (prod was ahead of `main`). Deploying either branch alone would have **clobbered the other** out of prod. Resolved per David's protocol: FF `feat/attendance-history` into local `main` → **rebased** this branch onto it → full suite + tsc on the **combined tree** (610 green, tsc clean) → **ONE additive deploy with BOTH features** → FF `main` to the combined branch (closes PR #2). Prod smoke confirmed **both** live: `/api/admin/attendance-history`→401, `/admin/data/attendance`→200, `/api/marked-absences`→401, `/e`→200, `/admin/cases`→200.
- **What this feature adds:** the office "Mark absent" form (`app/admin/cases/MarkAbsent.tsx`) gains a **date picker** (default today, `min`=today) and an **All-day toggle** (hides From/Until). The "Marked absent" list now shows **today + upcoming** (date-labeled "Today / Tue Jul 1", "All day" vs window, with Clear).
- **Data:** `marked_absences` doc gains **`all_day: boolean`**; all-day stores `from='00:00'`/`until='23:59'` so **covering-now (`isCovering`) is unchanged** — `all_day` drives display only. `date` validated server-side (`validDate` = `YYYY-MM-DD` AND `>= today`; past → 400). New pure helpers `validDate`/`resolveWindow`/`filterUpcoming` + `listUpcomingMarkedAbsences` (equality-only query + in-code date filter, no composite index). `POST /api/marked-absences` accepts `date`+`all_day` (all-day skips the window requirement); `GET` returns upcoming when no `?date`.
- **`/e` roster:** the ref-keyed `marked_absent` map gains `all_day` (no PII); the inline note + "Needs attention" pin show **"out all day"** vs "out until HH:MM".
- **⚠️ For David to verify interactively** (login + real ensemble token): Mark a kid absent for a future date and/or all-day → shows in the date-labeled list with Clear; on that day the `/e` roster shows the kid auto-Absent with "out all day"/"out until HH:MM". Plus the Attendance History view (Data ▸ Attendance) from PR #2.
- **Deferred minors** (in SDD ledger, none blocking): a couple of test-coverage regressions from file-replacement (DELETE-route test, save-disabled test) + an eslint import/first nit + `getTodayDate()` per-render.

---

## As of 2026-06-29 (Session 8) — Attendance History admin view SHIPPED (concurrent-session safe)

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24, `FUNCTIONS_DISCOVERY_TIMEOUT=60`; PR [#2](https://github.com/dbiel/camp-attendance/pull/2), branch `feat/attendance-history`, **NOT merged to main**). **603 unit tests** (591 from Session 7 + 12 new helper tests). Spec+plan in `docs/superpowers/{specs,plans}/2026-06-29-attendance-history*`. Prod smoke green. **No schema/index change, no cron, no change to the public `/e` flow.**

- **New Data ▸ Attendance sub-tab** (`/admin/data/attendance`): after-the-fact view of which ensembles took attendance, when, and which scheduled rehearsals were missed. **Grid** (default) = ensembles (Band 1–7, Orch 1–3) × past periods of a selectable day — 🟩 taken (inline absent badge, tap → time + counts), ⬛ scheduled-but-missed, — no rehearsal. **List** toggle = every submission grouped by period, newest-first, incl. force-opened. Day picker, default today, **past periods only**. "Who" = the ensemble/class name (links are anonymous, per David).
- **Architecture:** pure derivation `lib/attendance-history.ts` (unit-tested) ← thin `withAuth('lookup_admin')` route `GET /api/admin/attendance-history?day=&now=` ← live `periods`/rehearsal `sessions`/`ensemble_attendance` + `PICKER_ENSEMBLES`. Exported `lib/schedule.toMinutes` for the numeric past-period compare.
- **Self-review caught 3 (fixed before deploy):** (1) period `number` is an ordering index, NOT the label (5="Period 4B", 9="Period 7") → display the period **name**; (2) lexicographic time compare → numeric `toMinutes` (robust to unpadded `?now`); (3) **force-opened** submissions write `period_number`=clock hour (overlaps real period nums) — parsed from the `H<hour>` doc-id slot, excluded from grid cells, flagged in the list so they never clobber/mislabel a real column.
- **⚠️ Built in an isolated CLONE at `~/projects/camp-app-attendance-iso`** (NOT a worktree). A concurrent session was committing + `git clean`-ing the main repo, which destroyed two in-repo worktrees mid-build; a separate clone was the only safe workspace. The clone has its own `.env.local` (copied) + `node_modules`.
- **Deploy was made concurrent-safe:** first attempts hit a persistent `409` on `ssrttubocattendance` — that was the Session-7 deploy holding the function lock, not flakiness. Once Session 7 fast-forwarded onto `main` (origin/main → `837c3f0`), this branch was **rebased onto current main** and deployed **additively** (prod = main incl. the `/e` rework + this feature). Nothing was reverted; deploying from the un-rebased branch WOULD have clobbered Session 7's live work.
- **For David:** verify interactively (login) — open Data ▸ Attendance, toggle Grid/List, change the day, try `?now=` on the API. Then merge PR #2 to main when ready (it's rebased clean on main).

---

## As of 2026-06-29 (Session 7) — `/e` roster reports rework SHIPPED

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24; branch `feat/e-roster-reports-rework`). **591 unit tests** (+4 net). Built subagent-driven (4 tasks, per-task spec+quality review, opus whole-branch review → READY TO MERGE, no Critical/Important). Spec+plan in `docs/superpowers/{specs,plans}/2026-06-29-e-roster-reports-rework*`. Prod smoke green. **No schema/index change, no cron.**

- **What changed (manager-facing `/e` roster only; admin side untouched):** reorganized how the ensemble manager sees excused kids vs incidents.
  - **"Needs attention" pin → the kids the OFFICE excused** (`marked_absent`), amber, header "Needs attention — N (excused by office)", **display-only** (name · out until HH:MM · note). They still auto-mark Absent + show the inline note on their roster row.
  - **Incidents → a per-row "📄 Previous Report →" link**, shown on any kid with a report **from today — active OR resolved** (so the manager knows if the kid was reported absent/late in another class today). Tapping opens the report layer.
  - **The report layer** shows what happened (summary, status, **"Resolved — <note>"** for resolved) and **KEEPS** its typed update box (active reports). The **tap-Present "came back" tardy-arrival flow is unchanged** — both update channels preserved (David's explicit ask).
- **Code:** `lib/ensemble-incidents.ts` renamed/broadened — `listActiveIncidentRefs`→**`listTodayReportRefs`** (today active+resolved, roster-scoped), `getEnsembleIncidentByRef`→**`getEnsembleReportByRef`** (most-recent today case, any status); `postEnsembleIncidentUpdate` unchanged (targets the active case). `lib/projections.ts` adds **`resolution_note`** to the ensemble report projection (allowlist preserved — no new PII). `/e` GET returns **`report_refs`** (was `incident_refs`). "Today" = camp-tz date of `occurred_at||created_at` via `hourBucket().slice(0,10)`; in-code filter over active+resolved (no new index). Page: pin from `marked_absent`, per-row from `report_refs`, `openReportRef` state; layer shows the resolved note.
- **Prod smoke (live):** `/e/<bad>` → **200**, `/api/e/<bad>/incident/0` → **404**, `…/incident/0/update` POST → **410** (update path preserved), `/api/marked-absences` → **401**, `/admin/cases` → **200**.
- **⚠️ For David to verify interactively** (login + real ensemble token): excused kids in the yellow pin; a kid with a today report shows "📄 Previous Report" → layer (resolved shows "Resolved — <note>", active shows the update box); tap Present after submitting still pings you (came-back).
- **Process note:** during the build a subagent twice spun up an unrelated "attendance history" branch + git worktree under `.claude/worktrees/` — both removed; no impact on shipped code. (That idea — an at-a-glance "which rehearsals haven't taken attendance yet" board — is a real future option if wanted.)

---

## As of 2026-06-29 (Session 6) — Office-marked (excused) absences SHIPPED

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24; branch `feat/office-marked-absences`). **587 unit tests** (+21). Built subagent-driven (6 tasks, per-task spec+quality review, opus whole-branch review → READY TO MERGE, no Critical/Important). Spec+plan in `docs/superpowers/{specs,plans}/2026-06-29-office-marked-absences*`. Prod smoke green. **No cron, no `cases` schema/index change.**

- **What it is:** the admin marks a kid absent for a **clock-time window** (from–until, today); during that window the kid's row on the public `/e/<token>` ensemble roster **defaults to Absent + shows a note**; it **does not create an incident** on the admin board (suppression); if the manager taps Present (kid showed up) the office-absence **clears quietly** (no alert).
- **Admin UI:** **"Mark absent"** button on the Incident page (`app/admin/cases/MarkAbsent.tsx`, next to "+ New report") — `StudentPicker` (extracted to a shared `app/admin/cases/StudentPicker.tsx`) + From/Until `<input type=time>` + optional note. A compact **"Marked absent (today)"** list with **Clear** is the admin's record (these never become incidents).
- **Data:** new **`marked_absences`** collection (Admin-SDK-only, rules catch-all `read:if false`): `{student_id, student_name, date, from, until, note, status:'active'|'cleared', cleared_reason, created_by}`. `lib/marked-absences.ts` — **pure** covering-now logic (`status==active && date==today && from<=now<until`, `until` exclusive, **2-digit HH:MM** lexicographic compare, honors `?now=`). Expiry after `until` is computed (no cron). Queries are equality-only (no composite index).
- **Routes:** `POST /api/marked-absences` (create), `GET ?date=` (today's list), `DELETE /api/marked-absences/[id]` (clear `'manual'`) — all `withAuth('lookup_admin')`.
- **`/e` surfacing:** GET returns a **ref-keyed** `marked_absent` map `{ [ref]: {note, until} }` (opaque roster index, **no student_id/PII**). The page defaults those rows to Absent **before** overlaying a saved submission (a saved mark wins) and shows an amber "Office: out until HH:MM — note" line.
- **Submit (`submitEnsembleAttendance`):** office-absent set resolved **once** before the transaction; absent branch gains `&& !officeAbsent.has(studentId)` so a covered kid **files no case**; arrival-clear (`clearMarkedAbsence(id,'arrived')`) runs **after** the transaction (re-run-safe). Normal absences still file incidents exactly as before.
- **⚠️ For David to verify interactively** (login + a real ensemble token): Mark a kid absent for a window → `/e` roster shows them auto-Absent with the note → submitting files no incident on the board → marking them Present clears the office-absence. Public-route contract verified by prod smoke (admin routes 401; `/e` 200).
- **Deferred minors** (none blocking; in the SDD ledger): `/e` `?now=` regex still allows 1-digit hour (test-param only); `marked_absences` relies on the catch-all deny (could add an explicit rule); a couple of weak/redundant test+UI cosmetics.

---

## As of 2026-06-29 (Session 5) — Timeline notes + ensemble incident awareness + hourly carry-over + newest-first SHIPPED

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24; branch `feat/timeline-ensemble-awareness`). **566 unit tests** (+43). Built subagent-driven (8 tasks, per-task spec+quality review, opus whole-branch review → READY TO MERGE, no Critical/Important). Spec+plan in `docs/superpowers/{specs,plans}/2026-06-29-timeline-ensemble-awareness*`. Prod smoke green (see below). **No schema/index change, no cron.**

- **Add to the timeline (admin).** Case detail (`app/admin/cases/[id]/page.tsx`) now has an **"Add to timeline"** note box (`AddTimelineNote.tsx`) → posts a `note` event via the existing `/api/cases/[id]/events`; bumps `last_activity_at` so the hub badges "updated". Shows for active and resolved cases.
- **Ensemble roster → student incident layer (the big one).** On the public `/e/<token>` roster, students with an active incident **badge 🔴 + pin to a "Needs attention" section above the instrument groups** (they also stay in their instrument group for marking). Tapping opens a Modal (`StudentIncidentLayer.tsx`) showing the scoped incident **timeline + status + a two-way "add update" box** that posts back to the office (appears as a blue `staff_update` in the admin timeline; office updates flash "↻ updated" on the layer, mirroring `/r`).
  - New routes: `GET /api/e/[token]/incident/[ref]` + `POST …/update`; `GET /api/e/[token]` now also returns `incident_refs`. New lib `lib/ensemble-incidents.ts` (token+ref → incident, **scoped to the token's server-derived roster** — a leaked token reaches only its own ensemble's kids). New **no-dorm** projection `toEnsembleIncidentProjection` (allowlist: first name + last initial, instrument, summary, status, `staff_update` events only — **no dorm/medical/contact/raw text/student_id**). Uniform 404 (bad token/out-of-range ref), 400 (bad ref/empty/>2000 body), 410 (resolved/gone); per-IP rate limit + durable per-token cap on the write (mirrors `/r`).
- **Hourly carry-over (display-only).** The top active board shows **only the current clock hour** (`lib/active-board.ts` `partitionActiveByHour`, camp-tz). Once an incident's hour passes it **drops off the live board** and lives in the **history section at the bottom of the active tab** (`ReportHistory defaultStatus="active"`, grouped day→hour, **flagged red "(N active)"** — still active, **never status-changed / never hidden**). A single tappable pointer ("⏱ N still active from an earlier hour — in history below ↓", anchors to `#report-history`) keeps a still-missing kid one tap away. No cron. *(Refined 2026-06-29 from the original top "Carried over" group — David wanted a clean current-hour board.)*
- **Newest-first everywhere.** Active board flipped to newest-first (was oldest-first), within each group; `ReportHistory` within-hour order sorted newest-first (day/hour keys were already reverse-sorted); prior-cases already desc; ensemble grid is an ensemble×day matrix (no time order → unchanged).
- **Post-review fix:** the `?now=HH:MM` active-board override built a tz-naive timestamp (would mis-bucket on the UTC prod server); now built directly in camp tz via `currentHourKey` (+3 tests). Live behavior was always correct; this fixes the QA affordance.
- **Prod smoke (live):** `/api/e/<bad>/incident/0` → **404**, `…/incident/abc` → **400**, `…/incident/0/update` POST → **410**, empty body → **400**, `/e/<bad>` → **200**, `/admin/cases` → **200**.
- **⚠️ For David to verify interactively** (needs login + a real ensemble token): the Add-to-timeline box; the "Needs attention" pin + incident layer + Send-update round-trip on a real `/e/<token>?now=<rehearsal>` with an absent kid; the "This hour"/"Carried over" split (force a prior hour with `?now=`).

---

## As of 2026-06-29 (Session 4) — New student Brailey McCormick (Alto Sax, Band 5); Band-7 bassoon already moved

**🟢 LIVE in prod Firestore (`ttuboc-attendance`).** On `main` (clean). No code changes — one new student via Admin SDK (dry-run → apply → read-back). No deploy needed (app reads live Firestore).

- **Brailey McCormick — CREATED (`egXDGRfYHNz4ss4Qf6yB`), Alto Saxophone, Band 5 HS/MS.** Full schedule (9 enrollments): base `2,3,5,6,7` (rehearsals/lunch/assembly) + `107,108` (sax sectional+masterclass — saxes share the "Tenor Saxophone" sectional/masterclass label) + electives `203` (P1 Music in Film) & `233` (P6 Sax Choir B4/B5) — David gave electives, mirrors Aceyn Coronado `120`. division/dorm/grade/contacts blank (per no-blind-data rule).
- **⚠️ Base set ≠ "all sessions matching the ensemble."** The 25 sessions where `ensemble=='Band 5 HS/MS'` include per-instrument sectionals for every instrument; enrolling in all would wrongly add Bassoon/Trumpet/etc. sectionals. Correct base mirrors an existing same-instrument student (e.g. Dylan Coldiron `118`): commons + that instrument's sectional+masterclass.
- **"Move the only Band-7 bassoon to Band 6" — already done in Session 3.** Nash Fowler (`178`) is in Band 6 MS (alongside Liam Cleavinger `115`). Band 7 MS now has **zero** bassoons. No action taken — flagged to David as already complete.
- **For David / next session:** Brailey's division/dorm/grade/contacts are blank — fill in-app (Data ▸ Students) or hand over; do NOT fabricate.

---

## As of 2026-06-29 (Session 3) — Roster data edits (2 moves + 2 new students) via Admin SDK; deploy pipeline validated

**🟢 LIVE in prod Firestore (`ttuboc-attendance`).** On `main` (clean). No code changes this session — direct roster data writes + a deploy clear. **Standing rule added: never add camp data David didn't explicitly give** (`feedback-camp-no-blind-data` memory).

- **Roster moves must go through the Admin SDK, NOT the app UI.** `updateStudent` (`lib/firestore.ts:59`) updates only the student doc — it does **not** re-derive `session_students` enrollments. Editing ensemble in-app would strand a student in their old band's rehearsals. So each move = delete old ensemble-base enrollments + add the new ones (Admin SDK script, FB_* from `.env.local`; Firestore rules `read:if false` so firebase MCP reads 403). Pattern: dry-run → batch apply → read-back verify.
- **Angel Whealy (`605`, Euph): Band 6 MS → Band 5 HS/MS.** New electives per David: Music in Technology (sess 213, P1) + Tuba/Euph Ensemble B4/B5 (sess 237, P6); old electives dropped (collided with Band 5 P2 sectional / P7 rehearsal). Base 2,3,5,6,7,79,80.
- **Nash Fowler (`178`, Bassoon): Band 7 MS → Band 6 MS.** Electives Music in Film (P2) + Double Reed Ensemble B6/B7 (P7) carried over (fit Band 6's free slots). Base 8,9,10,11,13,14,163.
- **Audrey Schoonover — CREATED (`WXcuXCZjJZwR8jEDxduJ`), Flute, Band 6 MS.** Wasn't in roster; David said add new. Base only (8,9,10,11,13,14,54); **no electives** (P2/P7 open); division/dorm/grade/contacts blank.
- **Elida Ponce — CREATED (`bsAxw0SF66UvedGW4NL7`), Flute, Band 4.** Electives Music History (sess 211, P1) + Flute Choir B4/B5 (sess 230, P6). Base 22,24,26,27,28,129,130; division/dorm/grade/contacts blank.
- New students use Firestore **auto-ids** (`.add()`) to avoid colliding with numeric seed ids (1–632).
- **Deploy pipeline VALIDATED (no change needed):** the failed CI run David flagged was the Session-2 deploy-hardening commit itself working as designed — 3 retries all hit the transient `409` on `ssrttubocattendance`, so the job correctly went **RED** instead of fake-green. Cleared with the standing remedy: local owner `firebase deploy --only hosting` (Node 24, webframeworks, `FUNCTIONS_DISCOVERY_TIMEOUT=60`) → `release complete`. Smoke green.
- **For David / next session:** Audrey has no electives (P2/P7 open) and both new students have blank division/dorm/grade/contacts — fill in-app or hand over; do NOT fabricate (per the new rule).

---

## As of 2026-06-29 — Shared ensemble PICKER LINK live + Google sign-in fixed

**🟢 LIVE & confirmed by David on https://ttuboc-attendance.web.app.** On `main` (clean, pushed). **537 unit tests** (+13), build green. Two things shipped/fixed this session.

- **Shared picker link.** ONE link → pick your ensemble (Bands 1–7, Orchestra 1–3; Jazz excluded) → that ensemble's existing `/e/<token>` page. Replaces handing out 10 separate links. New `kind:'selector'` doc in `ensemble_links`; public `/e/pick/<token>` page + `GET /api/e/pick/[token]` (rate-limited, uniform 404); admin "Shared picker link" box in **Settings ▸ Ensemble Attendance Links** (create/copy/revoke). **Purely additive — attendance/submit/export/period-rollover untouched.** Code: `lib/ensemble-links.ts` (`PICKER_ENSEMBLES`, `issueSelectorLink`, `resolvePickerTargets`, `buildPickerItems`), `app/e/pick/[token]/page.tsx`, `app/api/e/pick/[token]/route.ts`, `app/admin/settings/EnsembleLinksSection.tsx`. Spec/plan in `docs/superpowers/{specs,plans}/2026-06-28-shared-ensemble-picker-link*`.
- **Google sign-in fixed (was broken on iPhone + desktop).** Deployed app's Firebase `authDomain` is `ttuboc-attendance.web.app`, but the OAuth client only had the `…firebaseapp.com` handler registered → Safari "missing initial state" + desktop `redirect_uri_mismatch`. **Fix (David did it in console — needs owner `davidbiel1919@gmail.com`):** added `https://ttuboc-attendance.web.app` (JS origin) + `https://ttuboc-attendance.web.app/__/auth/handler` (redirect URI) to the "Web client (auto created by Google Service)". Both desktop + phone sign-in now work.
- **⚠️ Deploy gotcha hit hard this session:** 5 rapid pushes to `main` wedged the SSR Cloud Run function (`ssrttubocattendance`) with `409 "unable to queue the operation"`; CI reported deploy "success" while the function update silently failed, so `web.app` served old code (route 404'd) for ~7 hrs even though the new code was live on Cloud Run directly. **Cleared by a LOCAL owner `firebase deploy --only hosting` (Node 24, webframeworks) — not CI reruns.** Don't push many commits to main in quick succession. Full details in the `feedback-camp-app-deploy` memory.

---

## As of 2026-06-28 (Session 2, late) — `/e` force-open + always-export + greyed idle roster LIVE

**🟢 DEPLOYED** (`main` @ `941847f`, pushed; local `firebase deploy --only hosting`, Node 24). **522 unit tests** (+4). Smoke green: bad-token GET → 404, bad-token **force** submit (`/submit`, `force:true`) → uniform 404 (not 500), `/e` page → 200.

- **Idle `/e` no longer a dead-end.** When no rehearsal is scheduled, the page now shows the **full roster greyed out** (still browsable — instrument accordion expand/collapse works; Present/Absent disabled), **Export roster (.xlsx) always available**, and a **"Force open attendance"** button.
- **Force open → live until the end of the actual clock hour.** Tapping it makes attendance live for the current clock hour `[HH:00, HH+1:00)`; submissions key to an **`H<hour>` slot** (distinct from scheduled `P<n>` slots — clock hours 8–17 overlap period numbers, so the P/H prefix is load-bearing). A **scheduled rehearsal always wins** over force. A submitted forced hour **resumes on browser refresh** (GET returns `status:'forced'`) until the wall clock rolls into the next hour, then it reverts to greyed/idle. Local force-state auto-expires at the hour boundary client-side too.
- **Server trust unchanged:** `force` only bypasses the "is a rehearsal scheduled now" gate; roster is still re-derived server-side, refs validated, absences still file period/slot-stamped reports. New `forcedPeriodFor` + `force` arg in `submitEnsembleAttendance`; `docId`/`getEnsembleSubmission` now slot-keyed (`P<n>`/`H<hour>`); GET always returns the roster.
- **Verify (`?now=`):** `…/e/<token>?now=12:30` → "No rehearsal right now" + greyed roster + Export + **Force open**; tap Force → roster activates, "Forced attendance · 12:00–13:00"; mark + Submit → report on hub; reload → stays live (resumed) until 1:00.

---

## As of 2026-06-28 (Session 2) — Real 2026 roster + full schedule SEEDED to live Firestore

**🟢 DATA LIVE on https://ttuboc-attendance.web.app.** Seeded from Google Drive (BOC26 folder, `1IVSgIsbJKzT_iCc-BTrfTIxGwV-uuhtS`) via a deterministic ETL: **632 students · 83 faculty · 10 periods · 264 sessions · 5,665 enrollments** (prod was empty → clean first seed). This satisfies the "David confirmed seeded" dependency the hourly-rolling attendance + now/next features needed. On `main`; **2 local commits not pushed** — `9d798a4` (seed: grade/school/electives passthrough) + `427ceab` (UI: room shown in student schedule detail, **deployed** via `firebase deploy --only hosting`). Push needs `gh auth switch --user dbiel`.

- **Roster:** each student carries instrument/ensemble/chair, grade+school, division (Overnight/Commuter), dorm building/room, parent/emergency contact, electives. Joined across **6 Drive sheets** by normalized name with a guarded fuzzy fallback (Levenshtein ≤1 + shared exact token + "don't match another real camper" guard).
- **Schedule:** full period grid parsed from the **10 Ensemble Master List `.docx`** — rehearsals/sectionals/masterclasses with **per-instrument rooms**, lunch, assembly, + each kid's 2 electives (room from the doc's options list). Jazz 1/2 = Period 8.
- **Room cross-check vs the color-coded `Master Schedule.pdf`** (parsed by word bbox): 196 agree; **3 conflicts** (Band 1 Clarinet sectional 207↔SOM 202; Band 6 Oboe/Horn room swap) → David chose **master wins** → `ROOM_OVERRIDES` in `build-schedule.mjs`, re-seeded → 0 discrepancies.
- **ETL lives in `source-data/2026/`** (gitignored — camper PII). Re-run after source edits: `node source-data/2026/build-seed.mjs && node source-data/2026/build-schedule.mjs` → clear `sessions`+`session_students` collections → `node scripts/seed-camp.mjs source-data/2026/build --yes`.
- **NEVER fill blind data** (David's hard rule): unmatched rooms show `"NA"` (15 sessions); missing grades/contacts left blank.
- **Known gaps — none blocking, all itemized in 3 `.txt` reports in the BOC26 Drive folder:** ~60 grade/contact nickname gaps (Abi/Abigail, Tony/Antonio), 42 elective `NA` rooms, 5 unlinked electives, commuter genders blank. Fillable in-app (Data ▸ Students).

---

## As of 2026-06-28 (late) — Hourly-rolling ensemble attendance LIVE (`main`)

**🟢 DEPLOYED to https://ttuboc-attendance.web.app** (local `firebase deploy --only hosting`, Node 24; `main` @ `1623803`, pushed → CI also deploys). **518 unit tests** pass (+10). Smoke: `/api/e/<bad>` → uniform 404 (with/without `?now=`), `/e/<bad>` page → 200. Spec/plan in `docs/superpowers/{specs,plans}/2026-06-28-hourly-ensemble-attendance*`.

- **What changed:** the existing `/e/<token>` ensemble links (Bands 1–7, Orch 1–3, Jazz 1–2) are now **period-aware**. Same tokens, no re-issue. The page resolves *which rehearsal this ensemble has right now* from live `sessions`+`periods`, shows `Ensemble · Period N · HH:MM–HH:MM · room`, and **auto-rolls** at each period boundary (marks reset to Present; prior hour clears from the taker's view). Between rehearsals: "No rehearsal right now. Next: …".
- **Keying:** submissions re-keyed day→**day+period** (`ensemble_attendance` doc id `token__date__P<n>`; doc gained `period_number`/`period_name`). Each hour is its own take; absences file reports stamped with `session_id`/`period_id`/`period_number` + `session_label` "Ensemble · Period N". Server re-resolves the period on submit and **rejects `no_rehearsal`** (409) so a stale tab can't file into the wrong hour. `?now=HH:MM` honored on GET **and** submit.
- **New code:** `resolveEnsembleNow` (`lib/schedule.ts`, gates to `type==='rehearsal'`); `resolveCurrentPeriod`/`getCurrentEnsembleSession` (`lib/ensemble-attendance.ts`); GET `/api/e/[token]` returns live session context; admin **Ensemble attendance** grid (Data ▸ Classes 3rd toggle, `EnsembleAttendanceGrid.tsx` + `/api/admin/ensemble-attendance`, lookup_admin, read-only, ensemble×day cells).
- **Hard dependency (David confirmed seeded):** requires 2026 rehearsal `sessions`+`periods` in live Firestore. Verified resolver against `source-data/2026/build` — Band 1 (P3+P4A then P6), Orch 1 (P2+P3 then P7) resolve correctly.
- **⚠️ For David to verify (after-hours now → plain links show "No rehearsal"):** open a real link with **`?now=10:20`** → should show `Period 3 · 10:00–10:50` + roster; **`?now=12:30`** → "No rehearsal right now. Next: …". Mark someone absent under a rehearsal `?now=` → report on hub; reload → mark persists for that period only.

---

## As of 2026-06-28 — GO-LIVE: Phases 4–6 + reskin live, merged to `main`, CI green

**🟢 LIVE & verified on https://ttuboc-attendance.web.app.** Branch `feat/incident-command-redesign` **fast-forwarded onto `main`** (both at `8455e69`); **CI now deploys green from `main`** (build + hosting + rules + indexes). **508 unit tests** pass. Full prod smoke test green: admin APIs → 401, public token routes → 404/410, viewer pages → 200, anon Firestore read of camper data → **403**. Tags: **`go-live-2026-06-28`** (rollback anchor), `deploy-2026-06-28-phases4-6-reskin`, `deploy-2026-06-27-pre-reskin`.

**Shipped this session (all live):**
- **Phase 4 report detail** — live 15s timeline poll (pause-hidden, stop-resolved) + "Where they should be" now/next + full-day schedule panel.
- **Live-feed notification badges** — `lib/seen.ts` seen-map; `cases.last_activity_at` bumped on every event. Hub cards show **"new"** (yellow) vs **"⬆ UPDATED"** (blue ring/badge) vs **"🏃 tardy arrived"**; ReportHistory dots; mobile `/r` "updated" flash. Hub also shows a pulsing **"🔔 N new · M updated"** banner; poll 30s→**15s**.
- **Phase 5 staff-link** — D1 dorm building + D3 auto-resolve + TTL **2h**. **D2 final decision (David): full FIRST name + LAST INITIAL only** (not full surname) + a current-status/updated-time line. Reviewed: no HIGH/MED.
- **Phase 6 ensemble attendance** — open `/e/<token>`, **grouped-by-instrument accordion** ("Flute — 7") / last-name sort; Present/Absent → Submit → auto-files reports; Absent→Present = tardy update; **submit button pulses on unsaved changes**. **Transaction-based** submit (review HIGH fixed). Admin link mgmt in Settings.
- **Liquid-glass reskin merged** (`feat/liquid-glass-reskin`, PR #1) + new surfaces restyled with its semantic classes.
- **XLSX export** (`lib/xlsx-export.ts`) — admin all-rosters (tab/ensemble) on Data▸Students + per-ensemble on `/e`.
- **Bulk-resolve** from the SelectionBar (auto-logs each).
- **Master schedule view** — Data▸Classes "Master schedule" toggle (`lib/master-schedule.ts` = **last year's** room×period grid + browser).
- **Faculty schedules** — Data▸Faculty mirrors Students: Current(room)/Next columns (`/api/faculty/now-next`) + expandable schedule w/ rooms.
- **Edit modals** scroll + **full-screen on mobile** (shared `components/Modal.tsx`; faculty + sessions converted).
- **Hardening** — durable **per-token** rate limiter (`checkRateLimitDurable`, Firestore-backed, fails open) on the two public writes.
- **Fixed latent gitignore bug** — `data/` rule also matched `app/admin/data/`, silently dropping `MasterSchedule.tsx` from git (CI caught it). Anchored to `/data/` + `/source-data/`.

**Waiting on David:**
1. **2026 elective rosters** (+ optional `grade`) and the **new master schedule** → drop into `lib/master-schedule.ts` (same shape) + seed via `scripts/seed-camp.mjs`. Master view + faculty/student now-next use *last year's* data until then.
2. **Rotate the Anthropic API key** (in chat/STATUS history) — new key → `ANTHROPIC_API_KEY` GH secret + local `.env.local`. **Manual; only David can.**
3. Optional: exact **score-order** instrument list (standard one in use; `lib/score-order.ts` toggle-ready).

**Known follow-ups (not blocking):** master-schedule view is a standalone reference, NOT yet wired into the live `sessions`/now-next (a "wire master schedule → live data" integration was offered); faculty Current/room columns are sparse until the master schedule populates `sessions.faculty_id` + `location`.

**Standing:** ultracode ON (workflow per phase + adversarial review before deploy). Autonomy: proceed + auto-deploy; **never send texts/emails / contact anyone outside the org** (CI egress guard green).

---

## As of 2026-06-27 — Redesign in progress (branch `feat/incident-command-redesign`)

- **🟢 LIVE:** Phases **1 + 2** of the incident-command-center redesign are deployed to https://ttuboc-attendance.web.app and verified. Full plan: `docs/superpowers/specs/2026-06-27-incident-command-redesign-plan.md` (expert-panel + CEO planned; 5 phases + Phase 6 + parking lot). Branch **not yet merged to main**; prod runs from branch deploys.
- **🔒 Security fix shipped:** `session_students`/`faculty`/`sessions`/`periods`/`attendance` were world-readable (`read: if true`) leaking camper dorm rooms → locked to `read: if false`. Verified anonymous read → 403.
- **Phase 1 (live):** single top-tab admin shell (`app/admin/layout.tsx`: **Incident · Data** + Data sub-tabs Reports/Students/Faculty/Sessions). (Inbox dropped from nav 6/27 per David — `/admin/inbox` + iMessage code kept dormant.) Plus: `/api/me` role seam + `auth-context` `role`/`isSuperAdmin`; **Clear-All-Data** (`/api/admin/wipe` + `lib/wipe.ts`, super-admin, server-side RESET, recursiveDelete); anti-leak headers on `/r/*`+`/api/r/*`; **CI egress guard** `tests/unit/no-external-egress.test.ts`; **`scripts/seed-camp.mjs`** direct seed (no import UI). Old Dashboard/Coverage/Import dropped from nav (code dormant).
- **Phase 2 (live):** flat urgency-sorted Active Reports hub (never collapses active), rich `CaseCard` (dorm locator + instrument + escalating elapsed) with selection checkbox outside the Link, `SelectionBar` (combined-link action stubbed til P5), day→hour history grouping (camp-tz) + status filter. `cases` schema gained `occurred_at`(always set)/denormalized dorm/instrument/division/`source`/`batch_id`/session+period ids — **server still orders by `created_at`, no new index**. DST-safe time helpers in `lib/date.ts` (`periodInstant`/`hourBucket`/`formatClock`). Both phases passed an adversarial review workflow.
- **Phase 3 (LIVE, adversarially reviewed):** multi-person paste → N reports (one text, 7–10 kids → N stacked cards, shared reporter, batch `POST /api/cases {people[]}` → `{ids,errors,results}`); **"No student found"** files an unmatched report (`student_id ''`, `needs_match`, ⚠ badge) so nothing is dropped; partial-batch failures keep the form open showing which failed; StudentPicker pins the current selection. Schedule now/next: `lib/schedule.ts` resolver + `getStudentScheduleSessions` (batched) + `ensemble-now-next` — surfaced on **report cards** (now/next line) and the **Students table** (Current/Next columns + click-to-expand detail). Report **history (day→hour) at the bottom of the Incident page** + Data ▸ Reports (shared `ReportHistory`). **`?now=HH:MM`** overrides the clock for testing periods. Two top-nav sections: **Incident · Data** (Inbox dropped, dormant).
- **Next:** Phase 3 leftover = **electives** (await David's 2026 elective rosters ~6/28; schedule already unions base+electives via session_students). Phases 4 (report detail: schedule/history/live-timeline via poll), 5 (staff links: dorm code, full name, auto-resolve, combined `staff_links`), 6 (ensemble open attendance → auto-incidents). In-app Claude API = later.
- **Standing:** ultracode ON (workflow per phase + adversarial review). Autonomy: proceed through phases without check-ins; **never send texts/emails / contact anyone outside the org** (CI-enforced).

---

## As of 2026-06-22 (late) — Current State

- **🟢 LIVE in production:** https://ttuboc-attendance.web.app → `/admin`. Redeployed 2026-06-22 with sub-projects **A + B + C** (below). Local `firebase deploy --only hosting,firestore:rules,firestore:indexes` (Node 24, `FIREBASE_CLI_EXPERIMENTS=webframeworks`, `FUNCTIONS_DISCOVERY_TIMEOUT=60`). SSR fn `ssrttubocattendance` on Node 24. Verified live: `/`→307 `/admin`, `/api/r/<bad>`→uniform 404, `/api/texts`→401.
- **Three features shipped (specs+plans in `docs/superpowers/`):**
  - **A — Access tiers:** `dorm_admin`→**`lookup_admin`** (back-compat read). `withAuth('lookup_admin')` (super_admin OR lookup_admin). Lookup admins: read/edit students + view/note Reports; NOT texts/escalate/admin/settings. Dual login: Google (just add email) **or** password accounts (temp pw or setup link; super admin can reset). Settings → Admin Users has role picker + password mgmt.
  - **B — iMessage ingest:** Mac Mini watcher (`scripts/imessage-watcher/`, launchd, read-only chat.db, decodes attributedBody) → `texts` (super-admin-only) → `/admin/inbox` (camp/personal auto-tag, camp default). Purges camp-end+30d. **NOT yet started as a daemon** — see Run section.
  - **C — Escalation + Reports:** "incident/case" → **"Report"** in UI. Inbox Escalate → Claude auto-draft → confirm. Reports visible to all admins. Per-Report tokenized two-way staff link `/r/<token>`, **expires 4h**, manual revoke, scoped projection (first name, last initial, instrument, dorm). Security-audited (`docs/superpowers/2026-06-22-security-audit.md`): no findings.
- **Branch:** `feat/incident-command-center` → **merged to `main`** (28+ commits). CI (`deploy.yml`) rebuilt: **Node 24**, writes `.env.local` from secrets (incl. **`ANTHROPIC_API_KEY`**), discovery timeout, `.npmrc` legacy-peer-deps (fixes frameworks esbuild ERESOLVE), deploys via firebase-tools+SA (not the static-only action). All required GH secrets set on `dbiel/camp-attendance`.
- **✅ CI deploy UNBLOCKED (2026-06-25):** three root causes fixed — (1) granted the 6 missing deploy roles to the CI SA `firebase-adminsdk-fbsvc@ttuboc-attendance` (firebaserules.admin, datastore.indexAdmin, cloudfunctions.admin, run.admin, artifactregistry.admin, cloudbuild.builds.editor; it already had firebasehosting.admin + iam.serviceAccountUser); (2) the `FIREBASE_SERVICE_ACCOUNT_TTUBOC_ATTENDANCE` GH secret held a **deleted/stale key** (set 2026-05-26, before the current key) → "Failed to authenticate"; refreshed it with the live key from `.env.local`; (3) enabled `cloudbilling.googleapis.com` on the project (firebase-tools tried to enable it during the functions billing check and the SA lacked serviceusage.services.enable for it). Verified by a full SA-credential deploy (hosting+rules+indexes+SSR fn) → `Deploy complete`. `deploy.yml` deploy step is now a **real gate** (no more `continue-on-error`); `workflow_dispatch` added for manual triggers. Local `firebase deploy` remains a valid fallback.
- **Prod Anthropic key:** the local deploy bundles `.env.local` into the SSR fn (Next loads it at runtime) → parse works. CI provisions it the same way (writes `.env.local` from secrets before build).
- **Secrets** in `.env.local` (Firebase web config, Admin SDK, Anthropic key — **old key was revoked, replaced 2026-06-22 with a valid one**). Camp code: `ttuboc2026`. `firebase-admin` uses ADC in prod.
- **Cost guard:** `frameworksBackend.maxInstances: 5`, `minInstances: 0`.
- **⚠️ Manual steps left for David:** (1) Start the iMessage watcher: `cd scripts/imessage-watcher && npm install && ./install.sh` (needs Full Disk Access for the node/launchd process — grant in System Settings). Text Message Forwarding to biel-home-server already ON. (2) Optional: billing budget alert ($5/mo). (3) Verify escalation auto-draft in prod when convenient (rest is verified). (4) Rotate the Anthropic key after camp (it's in chat history).
- **Phase 2 backlog (older):** reporter-name denormalization, note-entry UI, search debounce, `getAuthHeaders` memoization, templates-section 403 handling.

---

## What it is

Next.js 14 + Firestore + TypeScript app for the TTU Band & Orchestra Camp.
Pivoted 2026-06-09 to an **admin-only incident command center** — David did NOT
give the link to all ~88 faculty. Faculty text David; he logs cases
(paste/screenshot → Claude parse → confirm), taps to text parents/dorm staff,
shares two-way tokenized links. Roles: `super_admin` / `dorm_admin`. The teacher
attendance + coverage flow is kept **dormant** (not removed). Design spec:
`docs/superpowers/specs/2026-06-09-incident-command-center-design.md`.

## Run / build / deploy

**Node 24 is mandatory** — host Node v25 breaks Next 14 workers, jsdom, and
firebase-frameworks deploy. nvm is installed but NOT auto-sourced:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"   # or: source $(brew --prefix nvm)/nvm.sh && nvm use 24
```

- `npm run dev` — Next.js on `0.0.0.0:3000`. From laptop over Tailscale: `http://100.95.36.9:3000`.
- `npm test` / `npm run test:all` — Vitest (55 test files). `test:integration` + `test:e2e` need the Firestore emulator + Java (not on the Mac Mini).
- **Deploy:** `firebase deploy --only hosting` (Node 24 active). Fallback without Node 24: `FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only hosting`.
  - `engines.node` in `package.json` must be exactly `"24"` (not `"24.x"`, not a range) — Cloud Functions rejects ranges.
  - SSR function: `ssrttubocattendance` (us-central1, 256MB, nodejs24 v2).
- **Push:** requires `gh auth switch --user dbiel` (repo is on dbiel personal GitHub, not bieldentalcabinets).
- **Secrets:** copy `.env` / `.env.local` into the repo root. Required vars (see code):
  `NEXT_PUBLIC_FIREBASE_*`, `FB_PROJECT_ID`/`FB_CLIENT_EMAIL`/`FB_PRIVATE_KEY` (Admin SDK),
  `CAMP_CODE` (local fallback; prod reads Firestore), `ADMIN_BOOTSTRAP_EMAILS`,
  `ANTHROPIC_API_KEY` + `CASE_PARSE_MODEL` (case parsing). Prod also needs `ANTHROPIC_API_KEY` provisioned (deploy.yml doesn't inject it yet).

## Firebase & accounts

- **Project:** `ttuboc-attendance` (number `920996947233`).
- **Owner Google account:** `davidbiel1919@gmail.com` — NOT `david@bieldentalcabinets.com`.
- **NEVER create camp-app resources on the bieldentalcabinets Firebase.** (Hard constraint.)
- Firebase CLI is logged in as `davidbiel1919@gmail.com`; project pinned via `.firebaserc`.
- Hosting: `ttuboc-attendance` → `https://ttuboc-attendance.web.app`.
- **GitHub:** `dbiel/camp-attendance`.
- **Auth:** Admin = Google sign-in gated by Firestore `admins/{email}` allowlist (bootstrap via `ADMIN_BOOTSTRAP_EMAILS`). Teacher = `X-Camp-Code` header.

## Architecture map

- `app/admin/*` — admin pages: `cases` (+ `[id]`, `history`), `coverage`, `dashboard`, `faculty-status`, `schedule`, `settings` (+ `rollover`), `import`, `data/{faculty,sessions,students}`. **`app/admin/cases` is the live landing surface.**
- `app/teacher/*` — dormant teacher attendance flow.
- `app/api/*` — REST routes: `cases` (+ `parse`, `[id]/events`), `attendance` (+ `batch`, `coverage`, `report`), `faculty`, `students`, `sessions`, `import/*`, `config/{camp,camp-code/rotate,templates}`, `contacts`, `admins`, `stats`, `schedule`, `camps/rollover`.
- `lib/` — `firebase.ts` / `firebase-admin.ts` (SDK init), `auth.ts` / `auth-context.tsx` / `with-auth.ts` (authz), `cases.ts` / `case-parse.ts` (incident cases + Claude parsing), `contacts.ts` / `messages.ts` (tap-to-text), `attendance-*` / `projections.ts` / `attendance-rules.ts` (dormant attendance), `camp-config*` / `camp-code.ts`, `import-*`, `rate-limit.ts`, `types.ts`.
- `docs/plans/` — `master-plan.md`, `ux-product-track.md`, `security-track.md`, `code-health-track.md`.
- `docs/superpowers/specs/` — `2026-06-09-incident-command-center-design.md`, `2026-05-22-admin-attendance-dashboard-design.md`.

## Known gaps / backlog

- `xlsx` package has 2 unpatched high-severity advisories — consider `exceljs` swap.
- Prod `ANTHROPIC_API_KEY` not injected by `deploy.yml`.
- Offline unmark DELETE isn't queued (status union has no tombstone).
- Server-side Tardy derivation not implemented (belongs in `lib/attendance-rules.ts`).
- 16 API routes still use raw `getCallerRole` instead of `withAuth` (code-health Task 10, deferred).
- Phase 2 backlog (see Current State block).

## Pointers

- `HANDOFF.md` — long-form handoff notes.
- `README.md` / `SETUP.md` — setup details.
- Wiki: `obsidian-wiki/personal/areas/music/camp-app.md`; backlog `obsidian-wiki/todos/camp-app.md`.
- Auto-memory: `project_camp_app.md` points here.
