import { randomBytes } from 'node:crypto';
import { adminAuth } from './firebase-admin';
import { addAdmin } from './firestore';
import type { AdminRole } from './types';

// Synthetic login domain for people with no real email. These handles are
// login identifiers only — nothing is ever sent to them.
const LOGIN_HANDLE_DOMAIN = 'camp.local';

/** Lowercase, dot-separated slug of a person's name (for synthetic handles). */
export function slugifyName(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

async function emailInUse(email: string): Promise<boolean> {
  try {
    await adminAuth.getUserByEmail(email);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a synthetic login handle (`jane.smith@camp.local`) for someone with no
 * email, deduped against existing Firebase Auth users.
 */
export async function mintLoginHandle(name: string): Promise<string> {
  const base = slugifyName(name) || 'user';
  let candidate = `${base}@${LOGIN_HANDLE_DOMAIN}`;
  let n = 1;
  while (await emailInUse(candidate)) {
    n += 1;
    candidate = `${base}${n}@${LOGIN_HANDLE_DOMAIN}`;
  }
  return candidate;
}

function randomPassword(): string {
  // The user never types this — for setup_link accounts they set their own
  // password via the reset link. Just needs to satisfy the 6-char Firebase min.
  return randomBytes(18).toString('base64url');
}

export interface CreatePasswordAdminInput {
  /** Real (non-Google) email, optional. Omitted → a handle is minted from name. */
  email?: string;
  name: string;
  role: AdminRole;
  mode: 'temp_password' | 'setup_link';
  /** Required when mode is 'temp_password'. */
  password?: string;
  addedBy: string;
}

export interface PasswordAdminResult {
  email: string;
  /** Present only for 'setup_link' mode — David sends this to the person. */
  setup_link?: string;
}

/**
 * Create a password-based admin: a Firebase Auth email/password user plus an
 * allowlist doc tagged `auth_type: 'password'`. For 'temp_password' the caller
 * sets a starting password to hand over; for 'setup_link' a reset link is
 * returned so the person sets their own.
 */
export async function createPasswordAdmin(
  input: CreatePasswordAdminInput
): Promise<PasswordAdminResult> {
  const email = input.email?.trim().toLowerCase() || (await mintLoginHandle(input.name));
  if (input.mode === 'temp_password' && (!input.password || input.password.length < 8)) {
    throw new Error('Password must be at least 8 characters');
  }
  const initialPassword =
    input.mode === 'temp_password' ? input.password! : randomPassword();

  await adminAuth.createUser({ email, password: initialPassword, displayName: input.name });
  // addAdmin enforces email format + "already exists"; tag as a password account.
  await addAdmin(email, input.addedBy, input.role, {
    auth_type: 'password',
    name: input.name,
  });

  if (input.mode === 'setup_link') {
    const setup_link = await adminAuth.generatePasswordResetLink(email);
    return { email, setup_link };
  }
  return { email };
}

/**
 * Reset a password account's credentials: either set a new temp password
 * directly, or generate a fresh setup link for the person to set their own.
 */
export async function resetAdminPassword(
  email: string,
  mode: 'temp_password' | 'setup_link',
  password?: string
): Promise<{ setup_link?: string }> {
  const key = email.trim().toLowerCase();
  const user = await adminAuth.getUserByEmail(key);
  if (mode === 'temp_password') {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    await adminAuth.updateUser(user.uid, { password });
    return {};
  }
  const setup_link = await adminAuth.generatePasswordResetLink(key);
  return { setup_link };
}
