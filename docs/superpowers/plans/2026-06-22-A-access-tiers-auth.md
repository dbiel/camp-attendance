# A — Access Tiers & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Add a real `lookup_admin` tier (Google or password login, David can reset) alongside `super_admin`, wired end-to-end with server-side role enforcement.

**Architecture:** Roles live in `admins/{email}.role`. Auth hierarchy super_admin > lookup_admin > teacher resolved in `lib/auth.ts` + `lib/with-auth.ts`. Password accounts are Firebase Auth email/password users created via Admin SDK; Google accounts need only an allowlist entry. Account management UI in Settings → Admin Users.

**Tech Stack:** Next.js 14 App Router, Firebase Admin SDK (Auth + Firestore), Firebase Web SDK (client login), Vitest.

## Global Constraints
- Node 24 exactly (`engines.node: "24"`).
- All authorization server-side via Admin SDK; no client Firestore access to sensitive collections.
- Rename `dorm_admin` → `lookup_admin` everywhere; read legacy `dorm_admin` docs as `lookup_admin` (back-compat, no data migration required).
- `lookup_admin` capabilities: read/edit students, view+note Reports. NEVER: texts, escalate, manage admins, change settings.
- Self-removal stays blocked (already coded).

---

### Task 1: Rename role type `dorm_admin` → `lookup_admin` (back-compat read)
**Files:** Modify `lib/types.ts` (`AdminRole`), `lib/firestore.ts` (`getAdminRole`, `addAdmin`), `lib/auth.ts`, `lib/with-auth.ts`. Test: `tests/unit/lib/firestore.test.ts`, `tests/unit/lib/auth.test.ts` (create if absent).
**Interfaces:** Produces `AdminRole = 'super_admin' | 'lookup_admin'`; `getAdminRole(email)` maps stored `'dorm_admin'` → `'lookup_admin'`.
- [ ] Test: `getAdminRole` returns `'lookup_admin'` for a doc with `role: 'dorm_admin'` and for `role: 'lookup_admin'`; `'super_admin'` for super; legacy doc with no role → `'super_admin'` (current behavior preserved).
- [ ] Implement: change `AdminRole`; in `getAdminRole` normalize `dorm_admin`→`lookup_admin`.
- [ ] Run tests; commit.

### Task 2: Wire role hierarchy in auth resolution
**Files:** Modify `lib/auth.ts` (`CallerRole`, `getCallerRole`), `lib/with-auth.ts` (`RequiredRole`, `withAuth`). Test: `tests/unit/lib/with-auth.test.ts`.
**Interfaces:** Produces `CallerRole = 'super_admin' | 'lookup_admin' | 'teacher' | null` (note: change from current `'admin'`). `getCallerRole` returns the actual role. `withAuth(required)` with hierarchy: super_admin satisfies all; lookup_admin satisfies lookup_admin+teacher; teacher satisfies teacher.
- [ ] Test: super_admin caller → passes super_admin/lookup_admin/teacher routes. lookup_admin caller → passes lookup_admin/teacher, 403 on super_admin. teacher (camp code) → passes teacher, 401/403 above. No creds → 401.
- [ ] Test: back-compat — existing routes that required `'admin'` must keep working. **Decision:** map legacy `required: 'admin'` to `'super_admin'` (preserves today's behavior where only super_admin had admin access). Document in code.
- [ ] Implement hierarchy in `withAuth` + `getCallerRole`. Keep rate-limit + 401/403 semantics.
- [ ] Run tests; commit.

### Task 3: Role-aware admin storage (add with role, change role, list with role)
**Files:** Modify `lib/firestore.ts` (`addAdmin`, `listAdmins`, new `setAdminRole`). Modify `app/api/admins/route.ts` (POST accepts `role`), create `app/api/admins/[email]/route.ts` PATCH for role change (file currently only has DELETE). Test: `tests/unit/api/admins.test.ts`.
**Interfaces:** `addAdmin(email, addedBy, role='lookup_admin')`; `setAdminRole(email, role)`; `listAdmins()` returns `{email, role, added_by, added_at, auth_type?}`.
- [ ] Test: POST /api/admins with `{email, role:'lookup_admin'}` stores role; defaults to lookup_admin if omitted; super_admin required. PATCH role changes it; cannot demote self from super_admin (guard). DELETE still blocks self-removal.
- [ ] Implement; run; commit.

### Task 4: Password-account lib (create / reset / setup-link)
**Files:** Create `lib/admin-users.ts`. Test: `tests/unit/lib/admin-users.test.ts` (mock adminAuth).
**Interfaces:** Produces:
- `createPasswordAdmin({email, role, mode:'temp_password'|'setup_link', password?}) → {email, setup_link?}` — creates Firebase Auth user (Admin SDK `createUser`), writes allowlist doc with role + `auth_type:'password'`; for `setup_link` mode generate a password-reset/sign-in link via Admin SDK.
- `resetAdminPassword(email, mode, password?) → {setup_link?}` — `updateUser` password OR generate fresh setup link.
- `mintLoginHandle(name) → string` — `jane.smith@camp.local` slug for accounts with no email.
- [ ] Test: createPasswordAdmin('temp_password') calls adminAuth.createUser with the password + writes allowlist doc with role and auth_type. setup_link mode returns a link and does not require a password. mintLoginHandle slugifies + dedupes. resetAdminPassword updates password / returns link.
- [ ] Implement; run; commit.

### Task 5: Password-account API routes
**Files:** Modify `app/api/admins/route.ts` (POST branches: Google email vs password account), add `app/api/admins/[email]/password/route.ts` (POST reset). Test: extend `tests/unit/api/admins.test.ts`.
**Interfaces:** POST /api/admins body `{email?, name?, role, auth_type:'google'|'password', mode?, password?}`. For google → existing allowlist add. For password → `createPasswordAdmin`. POST /api/admins/[email]/password → `resetAdminPassword`. All super_admin-only.
- [ ] Test: google path unchanged; password path creates account + returns setup_link when mode=setup_link; reset route returns link / 200; super_admin gating (lookup_admin → 403).
- [ ] Implement; run; commit.

### Task 6: Settings → Admin Users UI (role picker, password accounts, reset)
**Files:** Modify `app/admin/settings/AdminUsersSection.tsx`. Test: `tests/unit/components/AdminUsersSection.test.tsx` (if component tests exist; else cover via API tests + manual).
**Interfaces:** Consumes the routes from Tasks 3 & 5.
- [ ] Add role select (Super admin / Lookup admin) to the add form; show role badge per row.
- [ ] Add "Add password account" mode: name → auto handle (or email), choose temp-password (input) or generate-setup-link (shows copyable link in a modal).
- [ ] Per-row actions for password accounts: "Reset password" (temp or new link), "Change role". Keep remove + self-guards.
- [ ] Verify build + run unit tests; commit.

### Task 7: Setup-link landing page (password set)
**Files:** Create `app/setup/[token]/page.tsx` (or reuse Firebase action handler). **Decision:** use Firebase Auth's email-action/sign-in-link flow — the generated link lands on a small client page that prompts for a new password and calls `confirmPasswordReset` / `updatePassword`. Test: manual + unit on any helper.
- [ ] Implement minimal page: read oobCode, prompt new password, confirm, redirect to /admin. Handle invalid/expired code.
- [ ] Build; commit.

### Task 8: Route re-tagging for student data (lookup_admin) + attribution
**Files:** Modify `app/api/students/route.ts`, `app/api/students/[id]/route.ts`, `app/api/students/[id]/schedule/route.ts` to require `lookup_admin` (read+edit) instead of bare `admin`. Add actor attribution to student writes (`updated_by` = caller email). Test: extend `tests/unit/api/students.test.ts`.
**Note:** cases/Reports re-tagging is done in Plan C; settings/admins/import/config stay super_admin.
- [ ] Test: lookup_admin can GET/PUT students (200); teacher 403; writes record `updated_by`.
- [ ] Implement; run full `npm test`; commit.

## Self-Review
- Spec coverage: roles ✓(T1-2), Google add ✓(T3), password create+reset+setup-link ✓(T4-7), capability scoping students ✓(T8) / Reports (Plan C), enforcement server-side ✓, attribution ✓(T8). 
- Note CallerRole changes `'admin'`→ role-specific; T2 maps legacy `required:'admin'`→`super_admin` to avoid breaking callers. Audit all `withAuth('admin'` and `getCallerRole()!=='admin'` call sites during T2/T8.
