# Shared Ensemble Picker Link — Design

**Date:** 2026-06-28
**Status:** Approved

## Problem

Today each ensemble has its own unguessable attendance link (`/e/<token>`),
backed by a doc in `ensemble_links` that maps the token to exactly one
ensemble. Roster, marks, submit, and export are all re-derived server-side from
that link's `ensemble` — an anonymous submitter can only ever touch that one
ensemble. This is secure but means David has to distribute and track **10
separate links** (Bands 1–7, Orchestra 1–3) to ensemble managers.

He wants to send **one** link. Opening it shows a picker of the 10 ensembles;
tapping one lands on that ensemble's existing attendance page.

## Decisions (settled in brainstorming)

- **One shared credential.** Whoever holds the picker link can open the picker
  and mark / submit / export attendance for any of the 10 ensembles. Accepted
  trade-off for a single link. The picker link is revocable as one credential.
- **Fixed ensemble list.** Exactly these 10 stored names, Jazz excluded:
  `Band 1`, `Band 2`, `Band 3`, `Band 4`, `Band 5 HS/MS`, `Band 6 MS`,
  `Band 7 MS`, `Orchestra 1`, `Orchestra 2`, `Orchestra 3`.
- **Additive only.** The existing per-ensemble links keep working; the entire
  attendance / submit / export / period-rollover path is untouched. The picker
  is a thin new layer that deep-links into it.

## Approach (A — fan out to existing per-ensemble tokens)

### Link model

Reuse the `ensemble_links` collection. A picker is one doc whose id is a fresh
`randomBytes(16).toString('hex')` token:

```
{
  kind: 'selector',
  allowed: string[],   // snapshot of PICKER_ENSEMBLES (the 10 names)
  label: string | null,
  created_at: string,  // ISO
  revoked: boolean,
}
```

Existing per-ensemble link docs are unchanged. They are implicitly
`kind` = (absent) → treated as a normal ensemble link. Resolution code that
maps a token to an ensemble must ignore selector docs (a selector token is not
a valid `/e/<token>` attendance link) and the picker resolver must ignore
ensemble docs.

`PICKER_ENSEMBLES` is a server constant (the 10 exact strings above), the single
source of truth for the list.

### Creation (admin)

When David creates a picker link:

1. Generate the selector token, write the selector doc with
   `allowed = PICKER_ENSEMBLES`.
2. For each of the 10 ensembles, **ensure a live per-ensemble link exists** —
   reuse the most recent non-revoked link for that ensemble, or issue a fresh
   one via the existing `issueEnsembleLink`. (Guarantees every picker button
   resolves. Idempotent: re-running reuses what exists.)

No per-ensemble tokens are stored on the selector doc — they are resolved live
at request time (below), so revoking/replacing a per-ensemble link never leaves
a stale pointer.

### Public flow

- `GET /api/e/pick/[token]` (new): rate-limited per IP (same limiter family as
  `/api/e`). Validate the token is a non-revoked **selector** doc; otherwise a
  uniform 404 (`{ error: 'This link is no longer valid.' }`) — no enumeration,
  matching the existing `/api/e/[token]` pattern. On success return:

  ```
  { items: [ { ensemble: string, token: string, count: number } ] }
  ```

  one entry per allowed ensemble, in `PICKER_ENSEMBLES` order, where `token` is
  the current non-revoked per-ensemble link and `count` is that ensemble's
  roster size. An ensemble with no resolvable live link is omitted (defensive;
  creation should prevent it).

- `app/e/pick/[token]/page.tsx` (new): client page mirroring `/e/[token]`'s
  loading / invalid states. Fetches the API, renders a simple vertical list of
  buttons — ensemble name + `count` — each an anchor to `/e/<perEnsembleToken>`.
  Forwards a `?now=HH:MM` test override onto the per-ensemble links so testing
  parity is preserved. Invalid/expired token → the same "This link is no longer
  active" screen the attendance page shows.

### Admin UI

In `app/admin/settings/EnsembleLinksSection.tsx`, add a **"Create shared picker
link"** action. After creation, surface the `/e/pick/<token>` URL at the top of
the section with copy-to-clipboard (reusing the existing per-link copy
affordance) and a revoke control. Existing selector links are listed and
revocable; revoke flips `revoked` on the selector doc (existing
`revokeEnsembleLink` works by token regardless of kind).

The admin create endpoint is `POST /api/admin/ensemble-links` extended with a
`kind: 'selector'` branch (or a sibling handler), admin-auth-gated exactly like
the existing link issuance.

## Security / validation

- The selector token is the credential (unguessable, revocable). Uniform 404 on
  unknown/revoked. Rate-limited per IP.
- No new write path is exposed to anonymous traffic — picker GET is read-only;
  the only writes (ensuring per-ensemble links) happen behind admin auth at
  creation.
- Submit / export / roster remain strictly per-ensemble-token scoped and
  unchanged. The picker only hands out tokens that already exist.

## Testing

- Selector creation writes a `kind: 'selector'` doc and ensures all 10
  ensembles have a live link (idempotent on re-run).
- `GET /api/e/pick/[token]` returns 10 items in `PICKER_ENSEMBLES` order with
  valid per-ensemble tokens and correct counts; excludes Jazz.
- Unknown / revoked selector token → uniform 404.
- A normal per-ensemble token is NOT accepted by the pick API (selector-only).
- A selector token is NOT accepted as an attendance token by `/api/e/[token]`.
- Page-render smoke: picker page renders buttons for the resolved ensembles;
  invalid token renders the inactive screen.

## Out of scope

- No change to how attendance is taken, submitted, exported, or rolled over.
- Jazz ensembles are intentionally excluded from the picker.
- No per-manager scoping within the shared link (explicitly accepted).
