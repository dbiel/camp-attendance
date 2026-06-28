# Liquid-Glass Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the entire camp admin app to a "liquid glass" (glassmorphism) look with a Texas Tech red palette, plus a label-only "Sessions → Classes" rename — without changing any application logic, data model, API, or routing.

**Architecture:** Token-first cascade, then sweep. First rebuild the centralized design layer (`globals.css` tokens + `camp-*` component primitives, `tailwind.config.ts` theme) so the ~37 files that already use the `camp-*` primitives reskin automatically. Then a per-area sweep converts files that use raw `bg-white`/`bg-gray` surfaces to the new glass primitives. Finish with a display-string-only rename and a full verification pass.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS v3, Vitest.

## Global Constraints

Every task's requirements implicitly include these:

- **Presentational only.** No changes to application logic, data model, Firestore collections, `/api/*` routes, URL paths, or import schemas. CSS, classNames, and visible copy only.
- **Keep Tailwind token names.** Repoint the *values* of `camp-green` / `camp-light` / `camp-accent` in `tailwind.config.ts`; do NOT rename the tokens (avoids churning class usage across the app).
- **Legibility first.** Translucency applies to surfaces only. Body/heading text stays solid and high-contrast (target WCAG AA). Attendance status colors must remain distinct: present = green, absent = red, tardy = yellow, unmarked = gray.
- **Rename is display-only.** "Sessions → Classes" changes visible strings only — never component names (`SessionCard`), variables, props, data fields (`session.name`), routes, or imports.
- **Tests stay green.** Baseline is **465 unit tests passing across 46 files**. No task may regress that count. Because changes are presentational, the suite should remain green throughout.
- **Base:** branch `feat/liquid-glass-reskin`, worktree `~/projects/camp-app-reskin`, based on tag `deploy-2026-06-27-pre-reskin` (`0378c44`).

**Note on TDD for this plan:** This is a visual reskin; there are no meaningful new unit tests for CSS. The regression guard for every task is: `npm run typecheck` clean, `npm test` still 465/465, `npm run build` succeeds, plus a visual confirmation. Each task's "verify" steps use those commands in place of a new failing test.

**Glass transformation recipe** (the canonical mapping used by every sweep task):

| Current (raw) | Replace with |
| --- | --- |
| `bg-white` on a card/panel/modal | `glass-card` (drop the `bg-white`; keep layout classes) |
| `bg-white rounded-lg shadow-sm border border-gray-200` | `camp-card` (already glass after Task 2) |
| `bg-gray-50` section background | `bg-[var(--surface)]` |
| `bg-gray-100` subtle fill | `bg-[var(--accent-soft)]` (interactive) or `bg-[var(--surface)]` (neutral) |
| `border-gray-200` / `border-gray-300` | `border-[var(--glass-border)]` |
| `text-gray-900` / `text-gray-800` | `text-[var(--text)]` |
| `text-gray-600` / `text-gray-700` | `text-[var(--text-2)]` |
| `text-gray-400` / `text-gray-500` | `text-[var(--text-3)]` |
| status/semantic colors (green/red/yellow for attendance, amber pending) | **leave unchanged** |

---

### Task 1: Design tokens + gradient background

**Files:**
- Modify: `app/globals.css` (add `:root` token block; update `body`)
- Modify: `tailwind.config.ts` (repoint `camp-*` color values)

**Interfaces:**
- Produces: CSS custom properties available app-wide — `--bg`, `--surface`, `--surface-solid`, `--card`, `--card-hover`, `--glass-border`, `--glass-shadow`, `--border`, `--text`, `--text-2`, `--text-3`, `--accent`, `--accent-soft`, `--accent-glow`, `--radius`, `--radius-sm`, `--radius-pill`, `--blur`, plus type-accent pairs (`--reh`/`--reh-bg`, `--sec`, `--master`, `--elec`, `--chamber`, `--other`). Tailwind colors `camp-green`/`camp-light`/`camp-accent` now resolve to the red family.

- [ ] **Step 1: Add the token block to `app/globals.css`**

Insert directly after the `@tailwind` lines (before the existing `*` reset):

```css
:root {
  --bg: #d6c5c5;
  --surface: rgba(255,255,255,0.5);
  --surface-solid: #f8f0f0;
  --card: rgba(255,255,255,0.55);
  --card-hover: rgba(255,255,255,0.75);
  --glass-border: rgba(255,255,255,0.45);
  --glass-shadow: 0 4px 24px rgba(100,20,20,0.07);
  --border: rgba(0,0,0,0.05);
  --text: #1a1010;
  --text-2: #6b4a4a;
  --text-3: #a08080;
  --accent: #cc0000;
  --accent-soft: rgba(204,0,0,0.08);
  --accent-glow: rgba(204,0,0,0.12);
  --radius: 20px;
  --radius-sm: 14px;
  --radius-pill: 100px;
  --blur: 16px;

  --reh: #cc0000; --reh-bg: rgba(204,0,0,0.08);
  --sec: #d4880a; --sec-bg: rgba(212,136,10,0.08);
  --master: #9c4cc8; --master-bg: rgba(156,76,200,0.08);
  --elec: #1a8a4a; --elec-bg: rgba(26,138,74,0.08);
  --chamber: #c86020; --chamber-bg: rgba(200,96,32,0.08);
  --other: #7a6860; --other-bg: rgba(122,104,96,0.08);
}
```

- [ ] **Step 2: Update `body` in `app/globals.css`**

Replace the existing `body { background-color: #f9fafb; color: #1f2937; ... }` rule's first two declarations so it reads:

```css
body {
  background: linear-gradient(135deg, #e8d0d0 0%, #f0dede 25%, #ffffff 50%, #f2d8d8 75%, #e0c4c4 100%);
  background-attachment: fixed;
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100vh;
}
```

- [ ] **Step 3: Repoint colors in `tailwind.config.ts`**

Change only the three color values (keep the key names):

```ts
colors: {
  'camp-green': '#cc0000',   // primary -> TTU red
  'camp-light': '#e03b3b',   // lighter red (hover/secondary)
  'camp-accent': '#d4880a',  // warm amber accent
},
```

- [ ] **Step 4: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 5: Visual check**

Run: `npm run dev` and open `/admin` (login as needed). Expected: warm red gradient background visible; existing green primary buttons/headers now render red. (Cards still opaque — fixed in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(reskin): add liquid-glass design tokens + red palette"
```

---

### Task 2: Glass primitive layer

**Files:**
- Modify: `app/globals.css` (`@layer components` block)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `.glass`, `.glass-card` utilities; reskinned `camp-card`, `camp-btn-*`, `camp-input`, `camp-label`, `camp-heading`, `camp-subheading`, `sticky-header`, `pending-badge`. All ~37 files using these primitives inherit the glass look with no JSX change.

- [ ] **Step 1: Add glass mixins at the top of `@layer components`**

```css
.glass {
  background: var(--surface);
  -webkit-backdrop-filter: blur(var(--blur));
  backdrop-filter: blur(var(--blur));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}
.glass-card {
  background: var(--card);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  box-shadow: 0 2px 12px rgba(120,30,30,0.05);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 2: Rewrite `camp-card`**

```css
.camp-card {
  @apply rounded-lg;
  background: var(--card);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  box-shadow: 0 2px 12px rgba(120,30,30,0.05);
}
```

- [ ] **Step 3: Rewrite `camp-input` and heading helpers**

```css
.camp-input {
  @apply w-full px-3 py-2 rounded-lg focus:outline-none;
  background: var(--card);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
}
.camp-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.camp-heading { @apply text-2xl font-bold mb-4; color: var(--accent); }
.camp-subheading { @apply text-lg font-semibold mb-3; color: var(--accent); }
.camp-label { @apply block text-sm font-medium mb-1; color: var(--text-2); }
```

- [ ] **Step 4: Rewrite `sticky-header` and `pending-badge`**

The `camp-btn-*` classes already use the `camp-green`/`camp-light`/`camp-accent` Tailwind colors, which are now red — leave them as-is. Update the two header/badge primitives:

```css
.sticky-header {
  @apply sticky top-0 z-50 px-4 py-3 transition-shadow duration-200;
  background: var(--surface);
  -webkit-backdrop-filter: blur(var(--blur));
  backdrop-filter: blur(var(--blur));
  border-bottom: 1px solid var(--glass-border);
}
.pending-badge {
  @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap self-start;
  background: var(--accent-soft);
  color: var(--accent);
}
.pending-badge::before {
  content: '';
  @apply w-1.5 h-1.5 rounded-full;
  background: var(--accent);
  animation: pulse 1.6s ease-in-out infinite;
}
```

- [ ] **Step 5: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 6: Visual check**

Run `npm run dev`, open `/admin/cases` and `/admin/settings`. Expected: cards now translucent/frosted with soft shadow; inputs have red focus ring; sticky headers frosted. Confirm text remains crisp and readable.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat(reskin): glass primitives — frosted cards, inputs, headers"
```

---

### Task 3: Admin shell chrome (glass pill nav)

**Files:**
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: tokens (Task 1), `.glass` (Task 2).
- Produces: glass pill top-tab + sub-tab nav for the whole admin app.

- [ ] **Step 1: Reskin the nav containers and pills**

In `app/admin/layout.tsx`, apply the glass-pill pattern to the nav. The top bar wrapper becomes a `.glass` strip; each tab uses pill styling with an active state. Concretely, update the `cls()` / `subClass()` helpers (the functions that return the per-tab className) so:
- inactive tab: `px-3.5 py-1.5 rounded-full text-sm font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-white/30 whitespace-nowrap transition-all`
- active tab: `px-3.5 py-1.5 rounded-full text-sm font-semibold text-[var(--text)] bg-white/60 shadow-sm whitespace-nowrap`

Wrap the `<nav>` group in a pill container: add `className="glass rounded-full p-1"` to the element wrapping the tab `<Link>`s (replacing any `bg-*`/`border-*` it currently has).

- [ ] **Step 2: Reskin the header bar surface**

Replace the header bar's current solid background (e.g. a `bg-camp-green` / colored bar) with a glass surface: `className="glass"` on the outer header container, and switch the settings/icon link text from `text-white/85` to `text-[var(--text-2)] hover:text-[var(--text)]` so it reads on the light glass.

- [ ] **Step 3: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 4: Visual check**

Run `npm run dev`, click through `/admin/cases`, `/admin/data/students`, `/admin/data/sessions`. Expected: frosted pill nav, active tab clearly highlighted, sub-tabs styled consistently, all labels legible.

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat(reskin): glass pill nav in admin shell"
```

---

### Task 4: Sweep — Incident / Cases area

**Files (apply the Glass transformation recipe to each):**
- Modify: `app/admin/cases/[id]/page.tsx`
- Modify: `app/admin/cases/NewReport.tsx`
- Modify: `app/admin/cases/ReportHistory.tsx`
- Modify: `app/admin/cases/SelectionBar.tsx`
- Modify: `app/admin/cases/CaseCard.tsx`

**Interfaces:**
- Consumes: `glass-card`, `camp-card`, tokens.

- [ ] **Step 1: Apply the recipe**

For each file, replace raw surface/border/text-gray classes per the Global Constraints recipe table. Example transformation (representative):

```tsx
// before
<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
// after
<div className="camp-card p-4">

// before
<span className="text-gray-500">{label}</span>
// after
<span className="text-[var(--text-3)]">{label}</span>
```

Leave any status/semantic colors (case severity reds, pending amber) unchanged.

- [ ] **Step 2: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open `/admin/cases` and a case detail `/admin/cases/[id]`. Expected: cards/panels frosted, no leftover opaque white boxes, text legible, severity/status colors intact.

- [ ] **Step 4: Commit**

```bash
git add app/admin/cases
git commit -m "feat(reskin): glass sweep — incident/cases area"
```

---

### Task 5: Sweep — Coverage & Faculty-status

**Files:**
- Modify: `app/admin/coverage/page.tsx`
- Modify: `app/admin/coverage/CoverageFilters.tsx`
- Modify: `app/admin/coverage/CoverageGrid.tsx`
- Modify: `app/admin/coverage/SessionCard.tsx`
- Modify: `app/admin/faculty-status/page.tsx`
- Modify: `app/admin/faculty-status/FacultyGrid.tsx`

**Interfaces:**
- Consumes: `glass-card`, `camp-card`, tokens.

- [ ] **Step 1: Apply the recipe**

Apply the Global Constraints recipe to each file. Note `SessionCard.tsx` here is a **component filename** — do not rename it (label-only rename is Task 9 and touches strings only). Preserve coverage status colors (covered/uncovered) as semantic colors.

- [ ] **Step 2: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open `/admin/coverage` and `/admin/faculty-status`. Expected: grids/cards frosted, status colors intact, legible.

- [ ] **Step 4: Commit**

```bash
git add app/admin/coverage app/admin/faculty-status
git commit -m "feat(reskin): glass sweep — coverage & faculty-status"
```

---

### Task 6: Sweep — Data, Dashboard, Schedule

**Files:**
- Modify: `app/admin/data/students/page.tsx`
- Modify: `app/admin/data/faculty/page.tsx`
- Modify: `app/admin/data/sessions/page.tsx`
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `app/admin/dashboard/StudentDetailModal.tsx`
- Modify: `app/admin/schedule/page.tsx`
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `glass-card`, `camp-card`, tokens.

- [ ] **Step 1: Apply the recipe**

Apply the recipe to each file. For the modal (`StudentDetailModal.tsx`), use `glass-card` for the modal panel and keep the backdrop overlay (e.g. `bg-black/40`) as-is. For tables, convert header/row striping from `bg-gray-*` to `bg-[var(--surface)]` and borders to `border-[var(--glass-border)]`.

- [ ] **Step 2: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open `/admin/data/students`, `/admin/data/sessions`, `/admin/dashboard`, `/admin/schedule`. Expected: tables/cards/modal frosted and legible.

- [ ] **Step 4: Commit**

```bash
git add app/admin/data app/admin/dashboard app/admin/schedule app/admin/page.tsx
git commit -m "feat(reskin): glass sweep — data, dashboard, schedule"
```

---

### Task 7: Sweep — Import, Settings, Inbox

**Files:**
- Modify: `app/admin/import/page.tsx`, `app/admin/import/UploadStep.tsx`, `app/admin/import/MappingStep.tsx`, `app/admin/import/PreviewStep.tsx`, `app/admin/import/ProgressBar.tsx`
- Modify: `app/admin/settings/page.tsx`, `app/admin/settings/AdminUsersSection.tsx`, `app/admin/settings/CampIdentitySection.tsx`, `app/admin/settings/ClearAllDataSection.tsx`, `app/admin/settings/MessageTemplatesSection.tsx`
- Modify: `app/admin/settings/rollover/page.tsx`, `app/admin/settings/rollover/InputStep.tsx`, `app/admin/settings/rollover/PreviewStep.tsx`, `app/admin/settings/rollover/SuccessStep.tsx`
- Modify: `app/admin/inbox/page.tsx`, `app/admin/inbox/TextRow.tsx`

**Interfaces:**
- Consumes: `glass-card`, `camp-card`, tokens.

- [ ] **Step 1: Apply the recipe**

Apply the recipe to each file. `ProgressBar.tsx`: convert its track `bg-gray-200` to `bg-[var(--surface)]` and keep the fill in `--accent`. `ClearAllDataSection.tsx`: keep destructive-action reds (`camp-btn-danger`) intact. Multi-step wizards (import, rollover): style each step panel as `glass-card`.

- [ ] **Step 2: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open `/admin/import`, `/admin/settings`, `/admin/settings/rollover`, `/admin/inbox`. Expected: wizard steps, settings sections, and inbox rows frosted and legible; destructive buttons still clearly red.

- [ ] **Step 4: Commit**

```bash
git add app/admin/import app/admin/settings app/admin/inbox
git commit -m "feat(reskin): glass sweep — import, settings, inbox"
```

---

### Task 8: Sweep — Teacher & public token views

**Files:**
- Modify: `app/teacher/page.tsx`
- Modify: `app/teacher/[id]/page.tsx`
- Modify: `app/teacher/[id]/session/[sessionId]/page.tsx`
- Modify: `app/r/[token]/page.tsx`

**Interfaces:**
- Consumes: `glass-card`, `camp-card`, tokens, `attendance-toggle` classes.

- [ ] **Step 1: Apply the recipe (preserve attendance status colors)**

Apply the recipe. **Critical:** the attendance toggle states (`attendance-toggle.present/absent/tardy/unmarked`, `count-*`) keep their semantic green/red/yellow/gray — only convert surrounding container surfaces (`bg-white` panels → `camp-card`, `bg-gray-50` → `bg-[var(--surface)]`). The public `/r/[token]` page must stay high-contrast for outdoor/mobile use.

- [ ] **Step 2: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 3: Visual check**

Run `npm run dev`, open `/teacher`, a teacher session attendance page, and a `/r/[token]` link. Expected: containers frosted; attendance present/absent/tardy buttons unmistakably green/red/yellow; counts legible.

- [ ] **Step 4: Commit**

```bash
git add app/teacher app/r
git commit -m "feat(reskin): glass sweep — teacher & public token views"
```

---

### Task 9: Rename "Sessions → Classes" (display strings only)

**Files (change visible strings only — NOT identifiers/components/routes):**
- Modify: `app/admin/layout.tsx` (sub-tab label `'Sessions'` → `'Classes'`)
- Modify: `app/admin/data/sessions/page.tsx` (headings/button/help text)
- Modify: `app/admin/dashboard/page.tsx` (visible "Session(s)" copy)
- Modify: `app/admin/schedule/page.tsx` (visible "Session(s)" copy)
- Modify: `app/admin/coverage/page.tsx`, `app/admin/coverage/SessionCard.tsx`, `app/admin/coverage/CoverageGrid.tsx` (visible copy only)
- Modify: `app/admin/cases/CaseCard.tsx` (visible copy only)
- Modify: `app/teacher/[id]/page.tsx`, `app/teacher/[id]/session/[sessionId]/page.tsx` (visible copy only)

**Interfaces:**
- Produces: user-facing terminology "Classes". No code/route surface changes.

- [ ] **Step 1: Find candidate strings**

Run: `grep -rn "Session" app --include="*.tsx"`
For each hit, change it ONLY if it is rendered text (inside JSX text nodes, string literals used as labels/headings/placeholders/aria-labels/button text). Leave untouched: component names (`SessionCard`, `<SessionCard`), imports, type names, variable/prop names, object keys, data fields (`session.name`, `s.sessionId`), and route/href strings (`/admin/data/sessions`, `/session/`).

- [ ] **Step 2: Apply replacements**

Singular "Session" → "Class"; plural "Sessions" → "Classes"; possessive/lowercase mid-sentence "session"/"sessions" in visible copy → "class"/"classes". Example:

```tsx
// before
{ key: 'sessions', label: 'Sessions', href: '/admin/data/sessions' },
// after  (label only — key and href unchanged)
{ key: 'sessions', label: 'Classes', href: '/admin/data/sessions' },

// before
<h1 className="camp-heading">Sessions</h1>
// after
<h1 className="camp-heading">Classes</h1>
```

- [ ] **Step 3: Verify no identifier/route was changed**

Run: `git diff` and confirm every changed line is a rendered string. Run: `grep -rn "'/admin/data/sessions'\|/api/sessions\|sessionId\|SessionCard" app --include="*.tsx"` and confirm those identifiers/routes are all still present (unchanged count vs. before).

- [ ] **Step 4: Verify build, types, and tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 5: Visual check**

Run `npm run dev`, open `/admin/data/sessions` (now labeled "Classes" in nav) and dashboard/schedule. Expected: the word "Classes" appears wherever "Sessions" used to be in the UI; URLs unchanged.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "feat(reskin): rename Sessions -> Classes (display labels only)"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full check suite**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: lint clean; typecheck clean; `Tests 465 passed (465)`; build succeeds.

- [ ] **Step 2: Leftover-opaque audit**

Run: `grep -rn "bg-white\b" app --include="*.tsx"`
Expected: only intentional cases (e.g. modal text-on-color, print views). Investigate any card/panel still on raw `bg-white` and convert it.

- [ ] **Step 3: Contrast / status-color spot check**

Run `npm run dev` and visually confirm across tabs: heading/body text passes AA contrast on glass; attendance present/absent/tardy/unmarked colors are unambiguous; destructive buttons are clearly red.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(reskin): final contrast & leftover-surface cleanup"
```

---

### Task 11: Centralize semantic status/badge/button classes (coordination addition)

Added per coordination with the `feat/incident-command-redesign` session so their
status UI, notification badges, and brand-new Phase 6 attendance pages can reuse this
reskin's design language without guessing. Purely additive to `app/globals.css`.

**Files:** Modify `app/globals.css` (append to end of `@layer components`).

- [ ] Add `.status-pill` + `.status-urgent` (red `--accent`), `.status-active` (amber `--sec`), `.status-resolved` (green `--elec`) status pills.
- [ ] Add `.badge-new` — yellow "new/unseen" notification badge (`#eab308` dot, `rgba(234,179,8,0.16)` fill).
- [ ] Add `.btn-present` (green `#22c55e`) / `.btn-absent` (red `#ef4444`) semantic attendance buttons.
- [ ] Verify `npm run typecheck && npm test && npm run build` (465 tests stay green). Commit `feat(reskin): centralized semantic status/badge/button classes`.

Constraint: additive only — no existing class altered, no component touched. (Existing
`CaseCard` inline status colors are left as-is to avoid conflicting with the other
session's `CaseCard` edits; the new classes mirror those colors for new surfaces.)

### Task 12: docs/RESKIN-NOTES.md (coordination addition)

A 1-page guide so the other session can restyle pages that don't exist in this branch.

**Files:** Create `docs/RESKIN-NOTES.md`.

- [ ] Document: palette + `:root` tokens; key component classes (`glass`, `glass-card`, `camp-card`, `camp-btn-*`, `camp-input`, `sticky-header`, `pending-badge`); semantic classes from Task 11 (`status-*`, `badge-new`, `btn-present/absent`); and a "to style a new surface, use X" recipe.
- [ ] Commit `docs(reskin): add RESKIN-NOTES design-system guide`.

---

## Self-Review

- **Spec coverage:** Foundation (tokens/theme) → Tasks 1–2. Reskin sweep all areas → Tasks 4–8 (covers every file in the enumerated raw-`bg` list). Shared chrome/nav → Task 3. Sessions→Classes label-only → Task 9. Verification (build/tests/typecheck/visual + legibility + status colors) → per-task verify steps + Task 10. No spec section is unmapped.
- **Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — each task carries the concrete recipe and representative code. The sweep recipe is the complete, exact instruction (a consistent mapping, not bespoke per-file design).
- **Type consistency:** No new functions/types introduced; CSS token names are defined once in Task 1 and referenced verbatim thereafter (`--text`, `--surface`, `--glass-border`, `--accent`, etc.). Tailwind token names intentionally unchanged.
