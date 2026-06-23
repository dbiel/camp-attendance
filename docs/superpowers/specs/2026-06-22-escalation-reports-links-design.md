# Escalation, Reports & Two-Way Staff Links — Design

> **Status:** Approved 2026-06-22. Sub-project C of four (A = access tiers; B =
> iMessage ingest; C = this; D = security audit). Depends on A (roles:
> super_admin escalates, lookup_admin views/notes) and B (texts to escalate
> from). Builds on the existing "cases" feature, which is renamed "Reports" in
> the UI.

---

## Purpose

Close the loop from inbound text to staff action:
1. David reviews a captured text (B) and **escalates** it into a Report — Claude
   auto-drafts the Report from the text (reusing existing case-parse), David
   confirms.
2. Every admin (super_admin + lookup_admin) can see Reports.
3. For each Report, David generates a **tokenized two-way link** and sends it to
   one staff member (councilor / dorm staff). The recipient sees a scoped view
   (first name, last initial, instrument, dorm room) and can post updates back
   that David sees live. The link **expires 4 hours after it is sent**, with
   manual revoke.

## Terminology

Rename **incident/case → "Report"** throughout user-facing UI. The internal
`cases` / `case_events` collections and `lib/cases.ts` stay as-is (no data
migration); only display strings change. Known UI string to change:
`app/admin/cases/[id]/page.tsx` "prior incident(s)" → "prior report(s)", plus
headings/buttons ("New Report" already exists in NewReport; audit cases pages
for "case"/"incident" user-facing copy and normalize to "Report").

## Architecture

### 1. Escalate a text → Report
- Inbox row (B) "Escalate to Report" → opens the existing NewReport confirm flow,
  **pre-seeded from the text**: calls `POST /api/cases/parse` with the text body
  (already returns candidate student, summary, session label, reporter).
- David reviews/edits → confirm → `POST /api/cases` creates the Report. On
  success, set the originating text's `escalated_case_id` (links text ↔ Report;
  prevents double-escalation — an already-escalated text shows "View Report").
- Reporter contact auto-created from the text sender when known (reuse existing
  NewReport contact-save path; sender phone already on the text).
- Requires `super_admin` (only David escalates).

### 2. Reports visible to all admins
- Today `GET /api/cases` + `GET /api/cases/[id]` require `super_admin`. After A,
  lower the **read** + **note** paths to `lookup_admin`:
  - `GET /api/cases`, `GET /api/cases/[id]` → `lookup_admin`
  - `POST /api/cases/[id]/events` (note / parent_texted / dorm_staff_texted) →
    `lookup_admin`
  - `POST /api/cases` (create), escalation, resolve/reopen, share-link
    generation → `super_admin`
- Sensitive PII on the detail page (medical notes, full parent contact) stays
  visible to admins (both tiers are trusted per A). Link viewers get the scoped
  projection only (below).

### 3. Tokenized two-way staff links
The `cases.share_token` field already exists (random hex generated at creation).
This sub-project activates it as a **per-Report, time-boxed, revocable** link.

**Link lifecycle**
- David clicks "Send staff link" on a Report → server issues a link record and
  returns the URL `/r/<token>` (token = the case's `share_token`, rotated on each
  new issue so an old link dies when a new one is made).
- Link state stored on the case: `share_issued_at`, `share_expires_at`
  (= issued + 4h), `share_revoked` (bool), `share_recipient_label` (free text:
  who David sent it to, for his own tracking).
- Validity = `!share_revoked && now < share_expires_at`. David can **revoke**
  anytime (sets `share_revoked`), or **re-issue** (new token, fresh 4h).

**Public viewer route** `/r/<token>` (no auth, token-gated)
- `GET /api/r/<token>` validates the token against a case and checks validity.
  Invalid/expired/revoked → generic "This link has expired" page (no info leak,
  no distinction between wrong/expired to avoid enumeration).
- Returns the **scoped projection ONLY** (extend `lib/projections.ts`):
  `{ first_name, last_initial, instrument, dorm_room, report_summary, status,
  updates: [...two-way thread...] }`. NEVER: last name, medical notes, parent
  contact, other students, raw text, or any other Report.
- Rate-limited (reuse `checkRateLimit`) and tokens are long random hex
  (unguessable).

**Two-way thread**
- Viewer can `POST /api/r/<token>/update` with a text update → appended as a
  `case_event` of a new type `staff_update` with `actor = share_recipient_label
  || 'staff link'`. Rate-limited; only while link valid.
- David sees these updates live in the Report timeline (existing case_events
  rendering, with `staff_update` styled distinctly).
- Viewer sees the running thread (their updates + any David marks visible). Keep
  it simple: the viewer thread shows `staff_update` events only (David's internal
  notes stay internal); status changes (e.g. resolved) are surfaced as a banner.

### Data model additions (on `cases`)
```
share_token            : string   // exists; rotated on each issue
share_issued_at        : string | null (ISO)
share_expires_at       : string | null (ISO)   // issued + 4h
share_revoked          : boolean
share_recipient_label  : string | null
```
New `case_events.type`: `staff_update`.

### Firestore rules
`cases` / `case_events` stay server-side-only (`if false`). The public viewer
never touches Firestore directly — it goes through token-validating API routes
(`/api/r/...`) using the Admin SDK, exactly as the rules comment anticipated.

## Error handling
- Expired/revoked/unknown token → uniform expiry page, 404-equivalent body, no
  enumeration signal.
- Double-escalation → blocked via `escalated_case_id`; UI shows "View Report".
- Re-issue invalidates the previous token immediately (token rotation).
- Viewer update after expiry → 410, friendly "link expired" message.

## Testing
- Unit: token validity (valid / expired-by-4h / revoked / unknown → correct
  status); projection contains ONLY the scoped fields (assert NO last_name,
  medical, parent, other cases); token rotation kills old token; rate-limit on
  viewer routes.
- Unit: role changes — `GET /api/cases` now allows lookup_admin; escalation /
  share-issue / resolve still require super_admin (lookup_admin → 403).
- Unit: escalation sets `escalated_case_id`; second escalate attempt blocked.
- Unit: `staff_update` event creation via viewer route; appears in timeline.
- Integration (emulator): full escalate → issue link → viewer GET → viewer POST
  update → David sees update → revoke → viewer blocked.

## Out of scope
- Viewer authentication / accounts (links are intentionally accountless, 4h).
- Notifications to David on new staff updates (future; he polls the Report).
- Editing Reports from the viewer (updates only).
