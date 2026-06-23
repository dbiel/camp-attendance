# C — Escalation, Reports & Two-Way Staff Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Escalate a captured text into a "Report" (Claude auto-draft → confirm), make Reports visible to all admins, and issue per-Report tokenized two-way staff links that expire 4h after sending.

**Architecture:** Reuse the existing `cases`/`case_events` collections (rename to "Report" in UI only). Escalation pre-seeds the existing NewReport flow from a text and links them. Share links activate the existing `cases.share_token` with issue/expiry/revoke fields and a public token-validating API + `/r/<token>` viewer page returning a scoped projection plus a two-way `staff_update` thread.

**Tech Stack:** Next.js App Router (public + admin routes), Firebase Admin SDK, Vitest, existing case-parse (Anthropic).

## Global Constraints
- Node 24. Depends on Plan A (roles) and Plan B (`texts`, `setTextEscalated`).
- UI term is "Report"; internal collections/lib stay `cases`/`case_events` (no data migration).
- Read+note Reports → `lookup_admin`; create/escalate/resolve/share-issue → `super_admin`.
- Links expire 4h after issue; revocable; re-issue rotates the token (old dies).
- Public viewer never touches Firestore directly — only token-validating `/api/r/*` routes (Admin SDK). Rate-limited. Scoped projection ONLY (no last name, medical, parent, raw text, or other Reports).

---

### Task 1: Rename incident/case → "Report" in UI
**Files:** Modify user-facing strings in `app/admin/cases/page.tsx`, `app/admin/cases/[id]/page.tsx` (e.g. line ~130 "prior incident(s)"), `app/admin/cases/history/page.tsx`, `app/admin/cases/CaseCard.tsx`, `app/admin/cases/NewReport.tsx`, and any nav labels. Test: grep gate.
- [ ] `grep -rniE "incident|\\bcase(s)?\\b" app/admin/cases components` → change only USER-FACING copy (headings, buttons, labels, empty states) to "Report"/"Reports". Leave variable/function/route/collection names.
- [ ] Build; visually confirm key pages; commit.

### Task 2: Lower Report read/note routes to lookup_admin
**Files:** Modify `app/api/cases/route.ts` (GET → lookup_admin; POST stays super_admin), `app/api/cases/[id]/route.ts` (GET → lookup_admin; PATCH resolve/reopen stays super_admin), `app/api/cases/[id]/events/route.ts` (POST note/parent_texted/dorm_staff_texted → lookup_admin). Test: `tests/unit/api/cases.test.ts` (+events test).
**Interfaces:** Consumes `withAuth` hierarchy from Plan A.
- [ ] Test: lookup_admin GET /api/cases + /api/cases/[id] → 200; POST events (note) → 200; POST /api/cases (create) → 403; PATCH resolve → 403; teacher → 403 on all. super_admin → all 200.
- [ ] Implement; run; commit.

### Task 3: Share-link lib (issue / validate / revoke / rotate)
**Files:** Modify `lib/cases.ts` (add fields + functions). Test: `tests/unit/lib/cases-share.test.ts`.
**Interfaces:** Produces:
- `issueShareLink(caseId, recipientLabel, now) → {token, url, expires_at}` — rotates `share_token` (new random hex), sets `share_issued_at=now`, `share_expires_at=now+4h`, `share_revoked=false`, `share_recipient_label`.
- `revokeShareLink(caseId)` — sets `share_revoked=true`.
- `validateShareToken(token, now) → {caseId} | null` — finds case by token; null if not found, revoked, or now≥expires_at.
- [ ] Test: issue sets 4h expiry + token; validate returns caseId when valid; null when expired (now=issue+4h+1s), when revoked, when token unknown; re-issue rotates token so the OLD token now validates null.
- [ ] Implement; run; commit.

### Task 4: Scoped projection
**Files:** Modify `lib/projections.ts`. Test: `tests/unit/lib/projections.test.ts`.
**Interfaces:** Produces `toStaffLinkProjection(case, student, staffUpdates) → {first_name, last_initial, instrument, dorm_room, report_summary, status, updates}`.
- [ ] Test: projection includes ONLY those keys; asserts NO `last_name`, `medical`, `parent`, `raw_text`, `student_id`, other cases. last_initial = first char of last name + '.'. updates = mapped staff_update events only.
- [ ] Implement; run; commit.

### Task 5: Public viewer API — GET + POST update
**Files:** Create `app/api/r/[token]/route.ts` (GET projection), `app/api/r/[token]/update/route.ts` (POST staff_update). Modify `lib/cases.ts`/`lib/types.ts` to add `case_events.type 'staff_update'`. Test: `tests/unit/api/r-token.test.ts`.
**Interfaces:** Consumes `validateShareToken`, `toStaffLinkProjection`, `addCaseEvent`. Both routes rate-limited (`checkRateLimit`), no auth.
- [ ] Test: GET valid token → 200 projection (scoped only); expired/revoked/unknown → 404-equivalent uniform body (no enumeration). POST update valid → appends staff_update event with actor=recipient_label||'staff link'; after expiry → 410; rate-limit returns 429.
- [ ] Implement; run; commit.

### Task 6: Public viewer page `/r/[token]`
**Files:** Create `app/r/[token]/page.tsx` (+ small client thread component). Test: manual.
**Interfaces:** Consumes `/api/r/[token]` + `/api/r/[token]/update`.
- [ ] Render scoped info card + status banner + two-way thread (list staff_updates, textarea to post). Expired/invalid → friendly "This link has expired" page. No app chrome / no links to admin.
- [ ] Build; commit.

### Task 7: Report detail — share controls + staff_update timeline
**Files:** Modify `app/admin/cases/[id]/page.tsx` + add a ShareLinkControls component. Test: unit on any helper; manual for UI.
**Interfaces:** Consumes `POST /api/cases/[id]/share` (create this route → issueShareLink, super_admin) and `DELETE /api/cases/[id]/share` (revoke). Render staff_update events distinctly in the timeline.
- [ ] Create `app/api/cases/[id]/share/route.ts` (POST issue w/ recipient label → returns URL; DELETE revoke; super_admin). Test in `tests/unit/api/cases-share-route.test.ts`: issue returns url+expiry; revoke ok; lookup_admin → 403.
- [ ] UI: "Send staff link" → prompts recipient label → shows copyable `/r/<token>` URL + countdown to expiry + Revoke/Re-issue. Timeline shows staff_update events.
- [ ] Build; run; commit.

### Task 8: Escalate text → Report
**Files:** Modify `app/admin/inbox/*` (Plan B) Escalate action → open NewReport pre-seeded with the text; modify `app/admin/cases/NewReport.tsx` to accept an optional seed (text body + source text id); on create call `setTextEscalated(textId, caseId)`. Add double-escalation guard. Test: `tests/unit/...` for the seed/link logic; manual for flow.
**Interfaces:** Consumes `POST /api/cases/parse` (existing), `POST /api/cases` (existing), `setTextEscalated` (Plan B), reporter contact save (existing).
- [ ] NewReport accepts `seedText?` + `sourceTextId?`; pre-fills parse from seedText. On successful create, if sourceTextId, PATCH the text with escalated_case_id.
- [ ] Inbox Escalate opens this; already-escalated text shows "View Report" linking to the case.
- [ ] Test: escalation sets escalated_case_id; second escalate blocked. Run full `npm test`; commit.

## Self-Review
- Spec coverage: rename ✓(T1), all-admin read/note ✓(T2), links issue/expire-4h/revoke/rotate ✓(T3,T7), scoped projection ✓(T4), public two-way API ✓(T5), viewer page ✓(T6), share controls + timeline ✓(T7), escalate+link+guard ✓(T8).
- Type consistency: `validateShareToken`/`issueShareLink`/`toStaffLinkProjection`/`setTextEscalated`/`staff_update` used consistently across tasks.
- Security: projection test asserts absence of PII keys (T4); uniform token-failure body (T5); rate-limit on public routes (T5).
