# Access Tiers & Auth — Design

> **Status:** Approved 2026-06-22. Sub-project A of three (A = this; B = iMessage
> ingest; C = text→incident escalation + link viewers). A is the foundation B and
> C depend on. This spec covers ONLY the role foundation, password login, and
> account management. The "texts" and "incident link" rows in the matrix below
> are shown so role boundaries are unambiguous; their *features* belong to B and C.

---

## Purpose

Today the camp app has exactly one effective admin tier: `super_admin` (David),
gated by Google sign-in against the `admins/{email}` allowlist. The `dorm_admin`
role type exists but is **not wired** — in `getCallerRole`, anything that isn't
`super_admin` resolves to nothing (falls through to teacher via camp code).

This sub-project introduces a real second tier of trusted helpers who can look up
and maintain kids' data without seeing the sensitive intake stream, and adds a
password-based login path for helpers who have no Google account.

## Roles

Rename the existing `dorm_admin` type to **`lookup_admin`** — the behavior is
general lookup/maintenance, not dorm-scoped, and the honest name prevents later
confusion. `super_admin` is unchanged.

A third tier, **link viewer** (tokenized, no account), is built in Sub-project C
and is shown here only for boundary clarity.

### Capability matrix

| Capability | super_admin (David) | lookup_admin | link viewer *(C)* |
|---|---|---|---|
| See incoming texts | ✅ | ❌ | ❌ |
| Approve text → escalate to incident | ✅ | ❌ | ❌ |
| Search / view all student data | ✅ | ✅ | ❌ |
| Edit student records | ✅ | ✅ | ❌ |
| View escalated incidents | ✅ | ✅ | scoped only |
| Add notes / events to incidents | ✅ | ✅ | ❌ |
| Manage admins (add / remove / reset) | ✅ | ❌ | ❌ |
| Camp settings (identity, templates, rollover, import) | ✅ | ❌ | ❌ |

`lookup_admin` is strictly **read + notes + edit kid data**. It never sees the
text intake stream, never approves/escalates, never manages admins or settings.

## Login mechanics

Two sign-in paths, both resolving to the user's assigned role.

### Google sign-in (existing)
For anyone with a **Google-backed email**. The entire grant is David typing the
email in Settings and picking a role:

1. Settings → Admin Users → type `jane@gmail.com`, pick **lookup admin** → save.
2. Writes `admins/jane@gmail.com` with `role: lookup_admin`.
3. Jane clicks **Sign in with Google**, picks her account.
4. `verifyAdmin` matches her email on the allowlist → she's in, scoped.

No setup link, no password, nothing on her end. Revoke = delete from the list.

**"Google-backed" caveat:** `jane@gmail.com` always works. A custom-domain
address (`jane@firstbaptist.org`) only works if that domain runs Google
Workspace or Jane created a Google account on it. If not, she uses the password
path instead.

### Password sign-in (new)
Firebase email/password auth, **only** for people without a Google account. The
login screen gains a "Sign in with password" option beside the Google button.

- Login ID is either the person's real (non-Google) email, or an auto-minted
  handle like `jane.smith@camp.local` — a login string, not a real inbox.
- Because these passwords live in David's Firebase Auth, **David can reset
  them**. (Google accounts he cannot — Google owns those; users self-recover.)

## Account management (Settings → Admin Users)

When creating a password account, David chooses the handoff per account:

- **Set a temp password now** — hand it over directly (text / in person). The
  user can change it after first login.
- **Generate a one-time setup link** — send it (text / QR / print); the user
  sets their own password.

For password accounts David can additionally: **reset password** (set a new temp
or re-issue a setup link), **change role**, and **remove**. For Google accounts
he can change role and remove (no password to manage). Self-removal stays blocked
(already coded in `DELETE /api/admins/[email]`).

The **role picker** in Settings (assign role on add / change later) is the
existing Phase-2 backlog item, now spec'd here.

## Enforcement & data model

- **Role storage:** `admins/{email}` doc's `role` field (already exists; values
  become `super_admin` | `lookup_admin`). Password accounts additionally get a
  Firebase Auth user record (created via Admin SDK).
- **Auth layer:** extend `getCallerRole` and `withAuth` to a real hierarchy
  **super_admin > lookup_admin > teacher**. Today `lookup_admin`/`dorm_admin`
  resolves to nothing; wire it through end-to-end. `RequiredRole` gains
  `lookup_admin`.
- **Route tagging:** every API route declares a minimum role.
  - **super_admin:** texts (B), approve/escalate (C), `/api/admins/*`, all
    `/api/config/*` settings, import, rollover.
  - **lookup_admin:** student read/edit, incident read + note.
  - **teacher:** unchanged (camp-code attendance flow).
- **Enforcement stays server-side** via the Admin SDK. Existing Firestore rules
  already deny all client access to sensitive collections, so **no
  `firestore.rules` changes are required for A**.
- **Attribution:** student/incident edits record the acting admin's email/name
  (dovetails with the "reporter-name denormalization" backlog item).

## Out of scope for A

- **iMessage ingest (B):** Mac Mini watcher reading `chat.db` → Firestore,
  super-admin-only text visibility.
- **Escalation + link viewers (C):** text → approve → incident → tokenized
  outbound staff links → scoped projection (first name, last initial, instrument,
  dorm room).

A builds only the role foundation, the password login path, and account
management — enough that B's "only David sees texts" and C's role checks have
something real to enforce against.

## Testing

- Unit: `getCallerRole` / `withAuth` resolve each role correctly; `lookup_admin`
  gets 403 on super-admin-only routes and 200 on permitted ones; teacher path
  unchanged.
- Unit: password account creation (both handoff modes), reset, role change,
  remove; self-removal still blocked; Google vs password distinction.
- Integration: a `lookup_admin` can read/edit a student and note an incident but
  is denied texts, approve/escalate, admin management, and settings.
- Regression: existing super_admin and teacher flows unaffected.
