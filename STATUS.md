# Camp App — STATUS

> **Read this first.** Canonical orientation for the TTU BOC camp app. The top
> block is volatile and refreshed each session; everything below is stable
> reference. If a fact here contradicts the code, trust the code and fix this file.

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
