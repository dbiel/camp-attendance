# Reskin Notes — Liquid-Glass Design System

This branch (`feat/liquid-glass-reskin`) reskins the camp admin app to a **liquid-glass**
(glassmorphism) look on a **Texas Tech red** palette. It is a presentational change only —
no logic, data model, API, or routing changed. This doc is the guide for styling **new**
surfaces (e.g. Phase 6 attendance pages that don't exist in this branch) so they match
without guessing.

**Everything lives in one place:** `app/globals.css` (tokens in `:root` + component
classes in `@layer components`) and `tailwind.config.ts` (the `camp-*` color names).

## Palette / tokens (`:root` in `app/globals.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--accent` | `#cc0000` | TTU red — primary accent, focus rings, active emphasis |
| `--accent-soft` | `rgba(204,0,0,0.08)` | subtle red fill (interactive hover, soft chips) |
| `--accent-glow` | `rgba(204,0,0,0.12)` | focus-ring glow |
| `--text` | `#1a1010` | primary text (solid, high-contrast) |
| `--text-2` | `#6b4a4a` | secondary text |
| `--text-3` | `#a08080` | muted/tertiary text |
| `--surface` | `rgba(255,255,255,0.5)` | translucent section background |
| `--card` | `rgba(255,255,255,0.55)` | card surface |
| `--card-hover` | `rgba(255,255,255,0.75)` | card hover |
| `--glass-border` | `rgba(255,255,255,0.45)` | hairline border on glass |
| `--glass-shadow` | `0 4px 24px rgba(100,20,20,0.07)` | soft glass shadow |
| `--radius` / `--radius-sm` / `--radius-pill` | `20px` / `14px` / `100px` | corner radii |
| `--blur` | `16px` | backdrop blur amount |

**Body background** is a fixed warm-red gradient (set on `body`). Type-accent colors for
color-coding categories also exist: `--reh`, `--sec`, `--master`, `--elec`, `--chamber`,
`--other` (each with a matching `*-bg`).

The Tailwind color names `camp-green` / `camp-light` / `camp-accent` are **repointed to the
red family** (`#cc0000` / `#e03b3b` / `#d4880a`) in `tailwind.config.ts`. Names are kept so
existing `bg-camp-green` etc. usages all became red automatically — **do not rename them.**

## Key component classes (`@layer components`)

| Class | What it is |
| --- | --- |
| `.glass` | translucent blurred surface + hairline border + soft shadow (use for bars/strips) |
| `.glass-card` | glass surface with `--radius-sm` corners (use for cards/panels/modals) |
| `.camp-card` | glass card with `rounded-lg` (the app's standard card) |
| `.camp-btn-primary` / `-secondary` / `-accent` / `-outline` / `-danger` | buttons (primary/secondary/accent are red now; danger stays red `bg-red-600`) |
| `.camp-input` (+ `:focus`) | glass input with red focus ring |
| `.camp-heading` / `.camp-subheading` | red headings |
| `.camp-label` | form label (`--text-2`) |
| `.sticky-header` | frosted sticky top header |
| `.pending-badge` | red pill with pulsing dot |

## Semantic system classes (reuse these — added for cross-session consistency)

| Class | Meaning / color |
| --- | --- |
| `.status-pill` + `.status-urgent` | red — urgent / overdue |
| `.status-pill` + `.status-active` | amber (`--sec`) — active / in-progress |
| `.status-pill` + `.status-resolved` | green (`--elec`) — resolved / done |
| `.badge-new` | **yellow** "new / unseen" notification badge (pairs with a dot) |
| `.btn-present` | green attendance button (`#22c55e`) |
| `.btn-absent` | red attendance button (`#ef4444`) |

Attendance toggles/count-bars (`.attendance-toggle.present/.absent/.tardy/.unmarked`,
`.count-present/absent/tardy/unmarked`) keep their **semantic** green/red/yellow/gray and
are intentionally NOT glassified — status legibility wins over aesthetics.

## To style a NEW surface

1. **Card / panel / modal body** → use `glass-card` (or `camp-card` for `rounded-lg`).
   For a modal, keep the backdrop overlay solid (`bg-black/40`); only the panel is glass.
2. **Section background / subtle fill** → `bg-[var(--surface)]`.
3. **Borders / dividers** → `border-[var(--glass-border)]`.
4. **Text** → `text-[var(--text)]` (primary), `text-[var(--text-2)]` (secondary),
   `text-[var(--text-3)]` (muted).
5. **Buttons** → `camp-btn-primary` (red) or `camp-btn-outline`; destructive →
   `camp-btn-danger`. Inputs → `camp-input`.
6. **Status / new badges / attendance buttons** → use the semantic classes above. Do NOT
   re-invent status colors inline — reuse `status-*`, `badge-new`, `btn-present/absent`.
7. **Never neutralize a semantic color.** Greens/reds/ambers/yellows that carry meaning
   (attendance, case status, errors, warnings, success) stay as-is.

## Conversion recipe (what the sweep applied)

`bg-white` card → `glass-card`/`camp-card` · `bg-gray-50` → `bg-[var(--surface)]` ·
`bg-gray-100` → `bg-[var(--accent-soft)]` (interactive) or `bg-[var(--surface)]` (neutral) ·
`border-gray-200/300` → `border-[var(--glass-border)]` · gray text → `--text`/`--text-2`/`--text-3`.
Buttons that were `bg-white` → `bg-[var(--surface)]` (not a card).
