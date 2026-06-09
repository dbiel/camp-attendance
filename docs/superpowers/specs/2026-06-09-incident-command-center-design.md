# Incident Command Center — Design

**Date:** 2026-06-09
**Status:** Approved by David (this doc formalizes the conversation)

## Summary

Rework the camp app from an everyone-uses-it attendance tool into an admin-only
**incident command center**. Faculty no longer sign in or take attendance in the
app — they text David (or the other super admin) when a kid is missing. The app
becomes the place where those reports are logged, matched against roster data,
tracked to resolution, and acted on: pre-formatted texts to parents and on-duty
dorm staff, and two-way share links for internal staff.

The existing teacher attendance flow and coverage dashboards are **kept dormant**
(code stays, behind the same login wall, no longer the primary surface) in case
of a future rework.

## Roles & auth

Reuse the existing Google sign-in + Firestore `admins` allowlist. Add a `role`
field to admin docs:

- **`super_admin`** — David + one peer. Full access: cases, intake, rosters,
  settings, duty rosters, dormant legacy pages. Receives push notifications.
- **`dorm_admin`** — e.g. John. Sees ONLY the duty-roster page(s) for their
  assigned dorm(s) plus the staff contact list. No camper data, no cases.

Super admins add/remove accounts and set roles from Settings. Existing
`ADMIN_BOOTSTRAP_EMAILS` behavior is unchanged; bootstrapped accounts default to
`super_admin`. Existing admin docs without a `role` are treated as `super_admin`.

## Data model (new Firestore collections)

- **`cases`** — one per incident: student ref (roster link), reporter (contact
  ref or free text), session/period where missed, status (`active` → `resolved`),
  resolution note, share token, created/resolved timestamps, createdBy.
- **`case_events`** — timeline entries per case: report received, parent texted,
  dorm staff texted, staff "on it" / "found" / update via share link, status
  changes, manual notes. Fields: case ref, type, actor (admin uid or share-link
  staff name), body, timestamp.
- **`contacts`** — staff phone book: name, role (`faculty` | `dorm_staff` |
  `admin` | other), phone (E.164 normalized), dorm (optional), notes. Single
  source for reporter matching, dorm-staff texting, and duty rosters.
- **`duty_rosters`** — per dorm: ordered list of recurring daily shifts
  (start/end time within ~8am–6pm; no overnight), each with an assigned contact
  ref. Supports per-day overrides without changing the recurring pattern.
- **`push_tokens`** — FCM device tokens keyed to super-admin accounts.

Existing collections (`students`, `faculty`, `periods`, `sessions`,
`session_students`, `attendance`, `admins`) are unchanged. Student data already
includes parent name/phone, kid cell, dorm building/room, medical notes,
division (resident/commuter), instrument, ensemble — no roster schema changes
needed. "Where should this kid be right now" derives from ensemble + schedule +
current period.

## Active Cases dashboard (post-login landing for super admins)

- Open cases as cards: kid name, dorm building/room, parent, where-they-
  should-be-now, time elapsed since report, last event.
- "Who's on duty now" strip across all dorms.
- **New Report** intake box at top (see Intake).
- **History** view: resolved cases, searchable. Each student's detail page
  lists prior incidents, so repeat absences are visible at a glance.

## Intake

A New Report box (textarea + image drop zone), mobile-first.

- **Paste parse:** raw text goes to a server route that calls the Claude API
  with the roster names and known contacts as context. Returns structured
  fields: student (fuzzy-matched — handles typos/nicknames; ambiguous matches
  return candidates), reporter (matched by phone/name against `contacts`),
  what happened, where/when.
- **Screenshot parse:** same route, vision model, handles multi-message threads.
- **Confirm screen:** parse is never trusted blind. Pre-filled case with every
  field tappable to correct; ambiguous student matches show candidates with
  dorm/ensemble. One tap creates the case.
- **Unknown sender:** confirm screen asks "Who is this?" (name + role), saves to
  `contacts`, recognized next time ("learn as you go").
- **Failure mode:** if the Claude call fails or returns nonsense, the confirm
  screen opens blank with the raw text attached — manual entry always works;
  parsing is an accelerator, never a gate.
- **Contact sheet import:** faculty/dorm-staff spreadsheet with phones joins the
  existing Excel import pipeline (alongside 2026 roster/schedule files when they
  arrive).

## Outbound messaging

From a case page (tap-to-text from David's own phone; no Twilio):

- **Text parent** — template-composed message, opened via `sms:` link with
  recipient + body pre-filled; David reviews and sends from Messages. Logged as
  a `case_event`. Copy-to-clipboard fallback on desktop.
- **Text dorm staff** — resolves kid's `dorm_building` → duty roster → shift
  containing current time → on-duty contact, shown as "On duty for X: Name
  (until 12:00)". If no one is on duty (or after 6pm), falls back to a manual
  picker filtered to dorm staff, flagged "no one on duty — pick manually."
- **Share case link** — generates `/c/{token}` (long random token, no login).
- **Templates** editable from Settings (no deploy needed). Message layer is
  designed so a programmatic sender (Twilio) could slot in later, but that is
  out of scope.

## Share link (internal staff)

Read-only case page: kid info, status, timeline. Plus:

- **"On it"** — one tap, stamps timeline with their name (asked once, remembered
  client-side), pushes to super admins.
- **"Found / resolved"** — prompts for a short note ("at the dining hall"),
  resolves the case, pushes to super admins.
- **"Add update"** — free-text timeline entry.

Tokens stop working when the case resolves (page shows "case closed") and all
tokens expire after a "camp end date" set in Settings.

## Duty rosters (dorm_admin surface)

Per dorm, recurring daily shifts covering ~8am–6pm. The dorm admin:

- defines shift blocks and assigns a person from `contacts` to each;
- can add a new person inline (name/phone/role → writes to `contacts`);
- can override any single day without changing the recurring pattern;
- edits take effect immediately.

## Notifications

App becomes a **PWA** (manifest + service worker). Super admins install to home
screen and grant notification permission. **FCM web push** fires on:

- share-link "On it" / "Found" / update,
- (Phase 3) Mac watcher suggested reports.

Notification tap deep-links to the case. Push failures never block anything —
the timeline is the source of truth.

## Phasing

1. **Phase 1 (core, usable at camp):** roles, data model, Active Cases
   dashboard, paste intake + confirm, case pages + timeline, outbound texts
   (manual dorm-staff picker), history.
2. **Phase 2:** screenshot intake, share links with On it / Found / updates,
   PWA + FCM push, duty rosters + dorm_admin role surface, contact-sheet import,
   on-duty resolution for dorm texting.
3. **Phase 3:** Mac Mini Messages watcher — standalone script reads `chat.db`
   for new texts, posts candidates to an authenticated API endpoint; they appear
   as "suggested reports" pending one-tap confirm. Fully isolated; if Apple
   breaks it nothing else is affected.

## Error handling & security notes

- Firestore rules: `cases`/`case_events`/`contacts`/`duty_rosters` readable and
  writable only by authenticated admins per role; share-link reads/writes go
  through server API routes that validate the token (no direct client Firestore
  access from share pages).
- Share tokens: ≥128-bit random, single case scope, dead on resolve + camp end.
- `dorm_admin` cannot read camper documents; API routes enforce role, not just UI.
- Claude API key lives server-side only; parse route is auth-gated.

## Testing

- Unit tests (vitest, existing repo patterns): student fuzzy-match candidates,
  reporter phone matching/normalization, on-duty shift resolution (incl. no-one-
  on-duty and after-6pm fallback), share-token lifecycle, role gating.
- Parse prompt gets a fixture set of realistic texts: typos, nicknames,
  multi-kid messages, multi-message screenshots.
