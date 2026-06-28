# Liquid-Glass Reskin — Design

**Date:** 2026-06-27
**Branch:** `feat/liquid-glass-reskin` (worktree at `~/projects/camp-app-reskin`)
**Base:** tag `deploy-2026-06-27-pre-reskin` (`0378c44`)
**Status:** Approved — pending implementation plan

## Goal

Reskin the entire camp admin app with the "liquid glass" (glassmorphism) design
language from the `ttu-music-schedule` reference project: translucent surfaces with
`backdrop-filter` blur, frosted cards, soft layered shadows, pill nav/badges, over a
warm gradient background. Shift the palette from the current forest **green** to
**Texas Tech red**, aligning the app with actual TTU Band & Orchestra Camp branding.

This is a **presentational** change. No application logic, data model, API, or routing
changes. The eventual merge back into the in-flight `feat/incident-command-redesign`
work must be low-conflict, which it is because the diff is overwhelmingly CSS +
className/label swaps.

## Non-Goals

- No renaming of the `sessions` **data model**, `/api/sessions`, or `/admin/data/sessions`
  **routes**. (See "Sessions → Classes" below — label only.)
- No changes to backend, Firestore collections, import schemas, or business logic.
- No functional/behavioral changes to any feature.

## Constraints & Principles

- **Minimal code impact:** maximize the centralized cascade, keep per-file edits purely
  presentational.
- **Legibility first:** this is an incident-command tool used under time pressure.
  Translucency applies to *surfaces only* — text stays solid, dark, and high-contrast
  (target WCAG AA). Attendance status colors (present/absent/tardy/unmarked) stay
  distinct and meaningful, not washed out by glass.
- **Reversible:** all changes live on an isolated branch off an immutable tag.

## Current-State Findings

- **Styling system:** Tailwind v3 with centralized component classes in
  `app/globals.css` (`camp-card`, `camp-btn-*`, `camp-input`, `camp-label`,
  `camp-heading`, `sticky-header`, `pending-badge`, attendance toggles, count bars) and
  three theme colors in `tailwind.config.ts` (`camp-green #2d5016`, `camp-light #6ba84d`,
  `camp-accent #f4a460`).
- **Reskin surface:** 46 `.tsx` files. ~37 use the `camp-*` primitives (reskinned for
  free when the primitives change). ~37 also use raw `bg-white` / `bg-gray-*` (need a
  per-file sweep). Sets overlap.
- **"Sessions" is two things:** a *label* (nav sub-tab + page text across 5 files:
  `app/admin/layout.tsx`, `app/admin/schedule/page.tsx`, `app/admin/dashboard/page.tsx`,
  `app/admin/data/sessions/page.tsx`, `app/teacher/[id]/page.tsx`) and a *data model*
  (`/api/sessions`, `lib/firestore.ts`, route paths, import schemas). We rename the
  label only.

## Approach (chosen: A — Token-first cascade, then sweep)

1. **Foundation (centralized, one-time).** Rebuild the token + primitive layer so most of
   the app reskins automatically.
2. **Sweep (mechanical, per-file).** Convert the raw `bg-white`/`bg-gray` files to the
   new glass primitives/tokens.
3. **Rename (label-only).** `Sessions` → `Classes` in visible copy.
4. **Verify.** Build + tests green, visual pass per tab.

Rejected alternatives: **B** (opt-in tab-by-tab) left two design systems coexisting
mid-flight; **C** (variable swap only) didn't deliver real glass (opaque cards stayed
opaque), failing the full-reskin goal.

## Design

### 1. Liquid-glass foundation

**Design tokens** (CSS custom properties in `globals.css`, adapted from the reference):

- Palette: `--accent: #cc0000` (TTU red) + `--accent-soft`, `--accent-glow`; warm
  gradient body background; text scale `--text` / `--text-2` / `--text-3`.
- Surfaces: `--surface`, `--card`, `--card-hover`, `--glass-border`, `--glass-shadow`.
- Shape: `--radius`, `--radius-sm`, `--radius-pill`, `--blur`.
- Type-accent colors (for color-coded badges, carried from the reference):
  rehearsal/sectional/masterclass/elective/chamber/other.

**Tailwind theme** (`tailwind.config.ts`): repoint `camp-green` / `camp-light` /
`camp-accent` to the red family. **Keep the existing token names** so no class usage
churns — only the values change. Add a radius/blur scale if needed.

**Glass primitives** (`globals.css`): add `.glass` and `.glass-card` (translucent bg +
`backdrop-filter: blur()` + hairline border + soft shadow). **Rewrite** the existing
primitives to glass so all consumers update with no JSX change:
- `camp-card` → glass card
- `camp-btn-primary/secondary/accent/outline/danger` → glass/red buttons
- `camp-input` → glass input with red focus ring
- `sticky-header` → glass header
- `pending-badge` → glass pill (keep pulse)
- Body background → warm red gradient (`background-attachment: fixed`).

### 2. Reskin sweep

- **Group 1 — primitive users (~37 files):** reskinned for free; visual QA only.
- **Group 2 — raw `bg-white`/`bg-gray` (~37 files, overlapping):** replace raw surfaces
  with `.glass-card` / tokens. Presentational only.
- **Shared chrome:** admin `layout.tsx` top-tab nav → glass pill nav (reference
  `nav-pill` style, active/hover states); gradient body bg; sticky header → glass.
- **Per-tab visual pass:** Incident (cases), Data (students / faculty / classes),
  dashboard, schedule, teacher view, attendance. Preserve attendance status colors
  (present = green, absent = red, tardy = yellow, unmarked = gray) as solid, legible
  states — glass treatment on the container, not on the status semantics.

### 3. "Sessions → Classes" (label-only)

Replace the **visible word** "Sessions"/"Session" with "Classes"/"Class" in nav sub-tab
label, page headings, button text, and helper copy across the 5 identified files. Leave
the data model, `/api/sessions`, and `/admin/data/sessions` URL paths untouched. Fully
reversible, zero backend risk.

> Note: this rename is the part the user will drive in a follow-up step; the foundation
> will be in place so it's a clean find-and-replace of display strings.

### 4. Isolation & merge-back

- Worktree `~/projects/camp-app-reskin` on `feat/liquid-glass-reskin`, base
  `deploy-2026-06-27-pre-reskin`. Other instance's checkout untouched.
- Diff is almost entirely CSS + className/label swaps → low-conflict merge back into the
  redesign branch.

## Verification

- `npm run build` succeeds.
- `npm test` (unit) stays green — baseline is 465 passing across 46 files; reskin must
  not regress it (presentational change, so it should not).
- `npm run typecheck` clean.
- Visual pass of each tab confirming the glass look and that text/contrast and attendance
  status colors remain legible.
