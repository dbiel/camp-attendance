# TTU Camp Attendance — Master Execution Plan

> Merges three domain plans into a single ordered execution schedule with parallel tracks, conflict hot spots, and merge gates.
>
> **Domain plans:**
> - [security-track.md](./security-track.md) — 12 tasks, ~4-5h with 2 subagents
> - [code-health-track.md](./code-health-track.md) — 21 tasks, ~1.5-2 days with parallelization
> - [ux-product-track.md](./ux-product-track.md) — 22 tasks, ~2-3 weeks with 2 engineers

**Goal:** Ship a publicly deployable, correct, secure, and maintainable camp attendance app. Current state is **not safe to deploy** (public PII leak, weak camp code, naive attendance writes) and has **P0 correctness bugs** (hardcoded dates, missing student detail modal, broken search). This plan fixes all P0s and the feature backlog in a coordinated multi-track execution.

**Total scope:** 55 tasks across three tracks, 3 wave cuts.

---

## The Three Tracks in One Paragraph

- 🛡️ **Security** — Lock down the data. Rotate camp code, add rate limiting, whitelist attendance writes, de-denormalize parent PII from attendance docs, harden Firestore rules.
- 🧹 **Code health** — Make the codebase honest. ESLint + strict TS, delete 484 lines of dead SQLite, `force-dynamic` on 18 routes, extract `withAuth()` wrapper, fix N+1 queries, America/Chicago timezone.
- 🎨 **UX/product** — Fix what breaks at camp + ship the features. Replace hardcoded 2026 dates with a real Settings page, build the missing student detail modal, harden attendance save (optimistic + offline queue), rewrite import with real CSV/Excel parsing, add yearly rollover.

---

## The Merge Order (The Core Decision)

The reviews agreed on one thing: **nobody has tried to run this in anger recently**. The hardcoded dates, missing modal, and dead SQLite layer all point to a half-finished handoff. That means the groundwork must come first, before anyone writes new features on top of shifting foundations.

**Wave 1 — Foundations** (blocks everything else, ~1 dev-day)
→ Code-health Phase A **must land first**. It sets the rules of the game for every file the other tracks will touch.

**Wave 2 — Security P0s** (unblocks deploy, ~half dev-day)
→ Security Tasks 1-8 land next, writing against the Phase A baseline. This is the single gate between "not deployable" and "deployable with work".

**Wave 3 — Parallel tracks** (feature work, ~2 weeks with 2 engineers)
→ With the baseline safe, all three tracks run in parallel: code-health Phases B-E, security Tasks 9-12, and all seven UX phases.

---

## Wave 1 — Foundations (MUST GO FIRST)

**Goal:** Establish the ground rules. Every subsequent task writes against strict TS, ESLint, `force-dynamic`, the `withAuth()` wrapper, and a green `npm test`.

**Owner:** Single agent or engineer, sequential. No parallelism here — each step depends on the last.

### Sequence

| Step | Source | Task | Effort | Why it blocks |
|---|---|---|---|---|
| 1 | code-health | 1 — ESLint config | S | Every new file must pass lint |
| 2 | code-health | 3 — Replace `lib/firebase-admin.ts` Proxy with typed getters | S | Prereq for strict TS |
| 3 | code-health | 2 — Enable strict TS + fix fallout | M | Every new file must be strict-clean |
| 4 | code-health | 4 — `force-dynamic` on all 18 API routes | S | Security + UX will both touch these files; one edit baseline |
| 5 | code-health | 5 — Fix `npm test` (emulator bootstrap) | M | Unblocks integration tests for both other tracks |
| 6 | code-health | 7 — Delete dead SQLite layer (`lib/db.ts`, scripts, `camp.db`, `better-sqlite3` dep) | S | Removes the "which db is real" confusion + SQL-injection footgun |
| 7 | code-health | 11 — `lib/date.ts` America/Chicago timezone | S | UX Phase 1 imports `getTodayDate()` from this |
| 8 | code-health | 9 — TDD `withAuth()` wrapper + convert one route | M | All new routes adopt wrapper from day one |

**Gate before Wave 2:** `npm run lint && npm run typecheck && npm run test && npm run build` must all be green. Then merge to `main`. Tag `baseline-1.0`.

**Explicit deferrals from Wave 1:**
- Code-health Task 6 (delete `middleware.ts`) — **deferred** until after Wave 2; security may want it for CSP headers.
- Code-health Task 10 (convert all 16 routes to `withAuth`) — **deferred** to Wave 3; we don't want to churn route files right before security starts editing them.
- Code-health Phase B Task 8 (doc cleanup), Phase D Tasks 12-17 (N+1 + types), Phase E (dep hygiene) — **all deferred** to Wave 3.

**Wave 1 total effort:** ~1 dev-day serial (can't meaningfully parallelize — each task modifies the previous task's output).

---

## Wave 2 — Security P0s (UNBLOCKS DEPLOY)

**Goal:** Close every finding that involves minor student data. After Wave 2, the app is deployable for real.

**Owner:** Single agent. Can split into two subagents on Group A / Group B after Task 1 lands.

### Sequence

| Step | Source | Task | Effort | Notes |
|---|---|---|---|---|
| 1 | security | 1 — Rotate camp code + timing-safe compare | M | Gates everything else in security |
| 2 | security | 2 — Rate limiter library (TDD) | M | Parallelizable with Tasks 9, 10, 11 after Task 1 |
| 3 | security | 3 — Teacher-safe projections + lock `/api/faculty` | M | Sequential with Task 4 (shared `lib/firestore.ts`) |
| 4 | security | 4 — Strip `dorm_room` from session students | S | Sequential after Task 3 |
| 5 | security | 5 — Wire rate limiter into all 17 routes | M | After Tasks 1 + 2 |
| 6 | security | 6 — Whitelist attendance `status`, derive `marked_by` server-side | M | Sequential with Tasks 7, 8 |
| 7 | security | 7 — Per-teacher session scoping for attendance GET | M | Sequential after Task 6 |
| 8 | security | 8 — De-denormalize parent PII from attendance docs | L | Sequential after Task 7 |

**Parallel groups (after security Task 1 lands):**
- **Group A (parallel to B):** Security Tasks 2, 9, 10, 11 — all touch disjoint files. Agent 1.
- **Group B (sequential chain):** Security Tasks 3 → 4 → 6 → 7 → 8. All share `lib/firestore.ts` and `app/api/attendance/route.ts`. Agent 2.

**Gate before Wave 3:**
- All unit tests green
- Security rules test green (against emulator — now works thanks to Wave 1 Step 5)
- Manual ops migration: rotate `CAMP_CODE` in prod env to a non-guessable 32+ char value
- Manual ops migration: run one-shot script to strip denormalized PII fields from existing `attendance/*` docs (flagged in security plan, not included in this plan)

**Wave 2 total effort:** ~4-5 hours with 2 parallel subagents.

**After Wave 2:** The app can be deployed publicly. Wave 3 is polish and features.

---

## Wave 3 — Parallel Tracks (FEATURES + CLEANUP)

**Goal:** Ship the feature backlog (Settings page, yearly rollover, import rewrite, student detail modal, attendance save-path hardening) plus the remaining cleanup.

**Owner:** Three parallel tracks, can run concurrently. Each track has internal sequencing.

### Track A — UX/product (the big one)

**Phase 1 — Date/config foundation** (unblocks the rest of UX; import from code-health's `lib/date.ts`)
- Tasks 1-6 from ux-product-track.md
- Effort: 5×S + 1×M

**Phase 2 — Attendance save-path hardening**
- Task 7 Modal/Toast → Tasks 8, 9, 10
- Effort: 1×M + 1×S + 1×M + 1×L = ~1 dev-day

**Phase 3 — Student detail modal + admin search fix** (depends on Phase 2 Modal)
- Tasks 11, 12, 13
- Effort: 1×S + 2×M

**Phase 4 — Settings page scaffolding** (depends on Phase 1)
- Tasks 14, 15
- Effort: 1×S + 1×M

**Phase 5 — Yearly rollover** (depends on Phase 4 Task 14)
- Tasks 16, 17
- Effort: 1×L + 1×M

**Phase 6 — Import rewrite** (independent after Phase 1)
- Tasks 18, 19
- Effort: 1×M + 1×L

**Phase 7 — Polish** (independent after Phase 2 Modal)
- Tasks 20, 21, 22
- Effort: 2×M + 1×S

**UX track total:** ~3.5-5 engineer-weeks solo, ~2-3 weeks with 2 engineers parallelizing A (phases 1→2→3→7) vs B (phases 4→5→6→7).

### Track B — Code health remainder

- **Phase B** Tasks 6, 8 — Delete `middleware.ts` (only if security confirms no CSP use), clean up docs
- **Phase C** Task 10 — Convert remaining 16 routes to `withAuth` wrapper (L)
- **Phase D** Tasks 12, 13, 14, 15, 16, 17 — Type `Promise<any>` returns, fix N+1 queries, composite index cleanup
- **Phase E** Tasks 18, 19, 20, 21 — Dependency hygiene, `.nvmrc`/engines, husky decision

**Track B total:** ~1 dev-day with sequential constraint on `lib/firestore.ts` edits (Phase D is serial within itself).

### Track C — Security polish

- **Security Task 9** — Firestore rules default-deny terminator (S)
- **Security Task 10** — Delete dead cookie writer + `/api/admin/login` (S)
- **Security Task 11** — Fail fast on missing Firebase env (S)
- **Security Task 12** — Reconcile with `withAuth()` wrapper (conditional, S/M)

**Track C total:** ~1-2 hours. Can run anytime in Wave 3.

---

## Cross-Track Conflict Hot Spots

All three plans flagged the same handful of files. Here's the merge discipline:

### `app/api/attendance/route.ts`
- **Security** adds status whitelist + server-derived `marked_by` (Tasks 6, 7) — changes POST contract
- **UX** adds DELETE handler for unmark + rewrites the teacher client to call batch endpoint (Task 10)
- **Code health** already added `force-dynamic` in Wave 1

**Merge discipline:**
1. Wave 2 lands security P0s first (POST contract is final)
2. UX Task 10 in Wave 3 rebases onto the new POST contract and adds DELETE as a new export (no conflict on POST)
3. If UX needs DELETE before Wave 2 finishes, land it in an isolated PR between Waves 1 and 2

### `lib/firestore.ts`
- **Security** edits `markAttendance` (strip PII fields), adds `isFacultyAssignedToSession`
- **UX** appends `markAttendanceBatch`, `performRollover`, `setCampConfig`, `rotateCampCode`
- **Code health** types 5 `Promise<any>` returns, parallelizes N+1s, imports `getTodayDate` from `lib/date.ts`

**Merge discipline:** Security's edits to `markAttendance` must land before UX's `markAttendanceBatch` so the batch helper uses the same shape. Code-health's N+1 parallelization edits the function bodies — those changes land last and rebase onto whatever was there. Target: single-file serial merge, each track takes its turn.

**Proposed order:** Wave 2 security → Wave 3 UX rollover/batch → Wave 3 code-health N+1. No conflicts if we stick to this ordering.

### `lib/types.ts`
- **UX** extends `CampConfig` with `start_date`, `end_date`, `timezone`
- **Code health** adds 5 new interfaces for the `Promise<any>` fixes
- **Security** shrinks `AttendanceDenormalized` (removes 7 PII fields)

**Merge discipline:** All three are additive or narrowing. No ordering constraint — let them merge in any order, union the diffs.

### `middleware.ts`
- **Code health** wants to delete (no-op, empty matcher)
- **Security** might want it for CSP/HSTS

**Decision point (must resolve before Wave 3):** Does security want CSP/HSTS via `middleware.ts` or via `next.config.js` `headers()`? If the latter, code-health deletes the file in Wave 3 Track B. If the former, security writes new middleware in Wave 3 Track C.

**Recommendation:** Use `next.config.js` `headers()` — it's simpler, works with Firebase Hosting webframeworks, doesn't require a matcher, and runs at the Firebase edge. Delete `middleware.ts` in Wave 3.

### All 18 `app/api/**/route.ts` files
- **Wave 1** puts `force-dynamic` on all of them — one clean commit
- **Wave 2** security edits many (rate limit, projections, validation)
- **Wave 3** code-health Task 10 converts to `withAuth()` wrapper
- **Wave 3** UX adds new routes (`/api/config/camp`, `/api/attendance/batch`, `/api/camps/rollover`, `/api/students/search`)

**Merge discipline:** New routes (UX) adopt `withAuth()` from day one if Wave 3 Track B Task 10 has landed; otherwise they use the current pattern and get converted in a follow-up pass. No route file gets touched by two tracks simultaneously in Wave 3 — assign a primary owner per file for each PR.

### Lockfile (`package.json`, `package-lock.json`)
- **Code health** removes `better-sqlite3`, `@opentelemetry/api`, moves build deps to devDeps, adds engines, husky decision
- **UX** adds `papaparse`, `xlsx`, `@testing-library/*`, `jsdom`

**Merge discipline:** Single "dep bump" window in Wave 3. Whoever goes second runs `npm install` and regenerates the lockfile. Don't interleave.

---

## Suggested Execution Schedule

### Day 1 — Wave 1 (single subagent)
- Morning: Steps 1-4 (lint, typed admin, strict TS, force-dynamic)
- Afternoon: Steps 5-8 (test harness, delete SQLite, timezone, withAuth)
- End of day: Gate passes, tag `baseline-1.0`

### Day 2 — Wave 2 (two subagents in parallel)
- Agent 1 (Group A): Security Tasks 1 → 2 → 9 → 10 → 11
- Agent 2 (Group B, after Task 1 lands): Security Tasks 3 → 4 → 6 → 7 → 8
- Manual ops: rotate prod `CAMP_CODE`, run PII cleanup migration
- End of day: Gate passes. **App is now deployable.**

### Days 3-15 — Wave 3 (three parallel tracks)
- Track A Eng 1: UX Phases 1 → 2 → 3 → 7
- Track A Eng 2: UX Phases 4 → 5 → 6
- Track B: Code health Phases B, C (Task 10), D, E — run between UX waves during `lib/firestore.ts` quiet windows
- Track C: Security polish (Tasks 9-12) — anytime, low priority

### Deploy checkpoint: After Wave 3 Track A Phase 1 (date foundation)
You can do a limited deploy here if you need to — the app is secure, functional, and has correct "today" logic. Phases 2+ are improvements.

---

## Decision Log

**Resolved (baked into this plan):**
1. Security goes first on `app/api/attendance/route.ts` (its changes reshape the contract; UX must target the final shape).
2. Code health owns `getTodayDate()` / timezone (it's a correctness bug, not a UX concern; UX imports from `lib/date.ts`).
3. `withAuth()` wrapper lands in Wave 1 as a prereq + converts one route; full conversion deferred to Wave 3 to avoid churning route files during security work.
4. `force-dynamic` lands in Wave 1 in one clean sweep; other tracks rebase.
5. Lockfile changes serialized to a single Wave 3 window.

**Open (need user decision):**
1. **Historical data access after yearly rollover** — UX plan assumes archival-only (old years preserved in `camps/{year}` but not queryable from UI). Confirm or request a historical view.
2. **Import format drift year-to-year** — UX plan assumes the 2025 Excel shape stays stable enough that the column-mapping UI handles variance. Confirm or request format-specific importers.
3. **Rollover timing** — UX plan assumes rollover happens in spring (prep for new year), not immediately after camp. Confirm.
4. **`middleware.ts` fate** — Recommend deleting it and putting CSP/HSTS in `next.config.js`. Security track to confirm.
5. **Tardy derivation** — Server-side auto-tardy when "present" is marked after period `start_time`. UX plan assumes this is security-owned code in a new `lib/attendance-rules.ts`. Confirm.
6. **Git remote** — Current `origin` is `davidbiel1919/ttuboc.git` (404). User suggested `dbiel/camp-attendance`, but that repo only has one unrelated initial commit. Need to decide: force-push local over `dbiel/camp-attendance`, create a fresh repo, or point at a different URL.

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Wave 1 strict-TS fallout is larger than estimated | Fix minimally with explicit types or casts; defer deeper typing to Wave 3 code-health Phase D |
| Security PII cleanup migration script missing | Ops runbook gate; script must be written and tested against a Firestore staging project before Wave 2 deploy |
| Emulator bootstrap script flakiness | Wave 1 Step 5 includes manual verification; flag for CI tuning if flaky |
| UX Phase 6 import rewrite hits unexpected Excel shapes | Column-mapping UI already handles arbitrary column names; worst case a specific sheet may need custom normalization |
| Rollover data loss risk | Integration test in Wave 3 UX Phase 5 runs against a scratch emulator project; production rollover only after a successful dry-run |
| Cross-track merge conflicts escalate | Each wave has a single-agent gate before the next wave starts; Wave 3 coordinates via the touched-files index in each domain plan |

---

## File Paths for This Plan Set

All four plans live in `docs/plans/`:

- `docs/plans/master-plan.md` — this file
- `docs/plans/security-track.md` — security & data safety
- `docs/plans/code-health-track.md` — lint, TS, dead code, N+1
- `docs/plans/ux-product-track.md` — UX fixes + Settings + rollover + import

## Execution Options

Per the writing-plans skill:

**Option 1 — Subagent-driven (recommended for Wave 1 + Wave 2):**
Fresh subagent per task, review between tasks, fast iteration. Best for the tightly-coupled sequencing of the first two waves.

**Option 2 — Inline execution:**
Batch execution with checkpoints. Good for Wave 3 Track B (code-health cleanup) where tasks are independent and mechanical.

**Option 3 — Human execution:**
Print the plan, work from it manually. Recommended for Wave 3 Track A if you want design control over the UX pieces.

**Recommended mix:**
- Wave 1: Subagent-driven (one agent, sequential, review between steps)
- Wave 2: Two subagents in parallel (Groups A and B)
- Wave 3 Track A: Human-driven (UX design control)
- Wave 3 Track B: Subagent-driven (mechanical cleanup)
- Wave 3 Track C: Either
