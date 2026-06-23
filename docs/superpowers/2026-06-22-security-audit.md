# Security Audit — `feat/incident-command-center` (A + B + C)

**Date:** 2026-06-22 · **Scope:** the full branch diff (incident command center Phase 1
plus sub-projects A access-tiers, B iMessage-ingest, C escalation/Reports/links).
**Method:** automated security review (identify → adversarially filter to ≥0.8
confidence) plus manual reading of the security-critical surfaces.

## Result: no high-confidence exploitable vulnerabilities introduced.

The security-sensitive code held up against the threat model (this app handles
minors' PII — names, dorm rooms, medical notes, parent contacts). Verified clean:

### Public `/r/<token>` staff-link viewer (unauthenticated, internet-reachable)
- `toStaffLinkProjection` (`lib/projections.ts`) is a strict field allowlist —
  constructs a fresh object with only `first_name, last_initial, instrument,
  dorm_room, report_summary, status, updates[]`. Never spreads source docs.
  `last_initial` is derived; no `last_name`, `medical_notes`, `parent_*`,
  `cell_phone`, `raw_text`, `student_id`, `share_token`, or other cases leak.
- `updates` is filtered to `staff_update` events only — internal notes and the
  raw text never reach the viewer.
- Viewer page renders bodies via normal JSX (React auto-escapes); no
  `dangerouslySetInnerHTML` anywhere in `app/` or `components/`.
- Failure responses are uniform (GET → 404, update → 410) for unknown/expired/
  revoked tokens — no enumeration oracle.

### Token security
- `share_token` = `randomBytes(16).toString('hex')` (128-bit CSPRNG).
- `validateShareToken` rejects unknown, revoked, never-issued (`share_expires_at`
  null), and expired (`now >= issued + 4h`) tokens.
- Re-issue rotates the token (old link dies immediately) and resets the 4h window.

### Authorization
- `withAuth('lookup_admin')` accepts only super_admin/lookup_admin and re-verifies
  the Firebase token + allowlist role server-side. Every super-admin-only action
  (texts, escalate, resolve, admin management, password reset, contacts, student
  delete, parse, share issue/revoke) is `withAuth('super_admin')`.
- `coerceAdminRole` is fail-closed (unrecognized role → null/deny); the
  `dorm_admin → lookup_admin` rename grants only the lower tier.
- Public write path hardcodes event `type: 'staff_update'` and derives `actor`
  server-side — no actor spoofing or cross-case writes.

### iMessage ingest & rules
- Watcher writes only via Admin SDK to `texts`/`ingest_state`, both denied to all
  clients in `firestore.rules`; texts readable only by super_admin.
- `decodeAttributedBody` returns `''` on malformed input (safe worst case).
- All incident-center collections (`cases`, `case_events`, `contacts`, `texts`,
  `ingest_state`) are `allow read, write: if false` behind a catch-all deny.

## Non-blocking hygiene note (not a vulnerability)
- `PUT /api/students/[id]` accepts arbitrary client fields (strips only the
  server-stamped `updated_by`/`updated_at`). The `students` doc has no
  privilege-bearing fields, so this is not exploitable for escalation or trust-
  boundary crossing. A future field allowlist would be tidier defense-in-depth.

No changes were required before go-live.
