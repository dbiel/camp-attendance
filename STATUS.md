# Camp App — STATUS

> **Read this first.** Canonical orientation for the TTU BOC camp app. The top
> block is volatile and refreshed each session; everything below is stable
> reference. If a fact here contradicts the code, trust the code and fix this file.

---

## As of 2026-06-27 — Redesign in progress (branch `feat/incident-command-redesign`)

- **🟢 LIVE:** Phases **1 + 2** of the incident-command-center redesign are deployed to https://ttuboc-attendance.web.app and verified. Full plan: `docs/superpowers/specs/2026-06-27-incident-command-redesign-plan.md` (expert-panel + CEO planned; 5 phases + Phase 6 + parking lot). Branch **not yet merged to main**; prod runs from branch deploys.
- **🔒 Security fix shipped:** `session_students`/`faculty`/`sessions`/`periods`/`attendance` were world-readable (`read: if true`) leaking camper dorm rooms → locked to `read: if false`. Verified anonymous read → 403.
- **Phase 1 (live):** single top-tab admin shell (`app/admin/layout.tsx`: Active Reports · Data · Inbox[super] + Data sub-tabs Reports/Students/Faculty/Sessions); `/api/me` role seam + `auth-context` `role`/`isSuperAdmin`; **Clear-All-Data** (`/api/admin/wipe` + `lib/wipe.ts`, super-admin, server-side RESET, recursiveDelete); anti-leak headers on `/r/*`+`/api/r/*`; **CI egress guard** `tests/unit/no-external-egress.test.ts`; **`scripts/seed-camp.mjs`** direct seed (no import UI). Old Dashboard/Coverage/Import dropped from nav (code dormant).
- **Phase 2 (live):** flat urgency-sorted Active Reports hub (never collapses active), rich `CaseCard` (dorm locator + instrument + escalating elapsed) with selection checkbox outside the Link, `SelectionBar` (combined-link action stubbed til P5), day→hour history grouping (camp-tz) + status filter. `cases` schema gained `occurred_at`(always set)/denormalized dorm/instrument/division/`source`/`batch_id`/session+period ids — **server still orders by `created_at`, no new index**. DST-safe time helpers in `lib/date.ts` (`periodInstant`/`hourBucket`/`formatClock`). Both phases passed an adversarial review workflow.
- **Next:** Phase 3 (multi-person paste → N reports + "No student found" unmatched flag; schedule auto-populate B5/reporter B6). **Discuss "current/next class" + Students-table Current/Next columns with David before building** (parking lot). Needs 2026 roster + **elective rosters** (David delivering ~6/28). Schedule = ensemble base + elective rosters. Phases 4 (report detail, poll not onSnapshot), 5 (staff links: dorm code, full name, auto-resolve, combined `staff_links`), 6 (ensemble open attendance → auto-incidents) follow. In-app Claude API = later.
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
