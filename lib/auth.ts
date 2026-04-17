import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb } from './firebase-admin';
import { bootstrapAdminIfEmpty, isAdminEmail } from './firestore';

export type CallerRole = 'admin' | 'teacher' | null;

/**
 * Constant-time string comparison. Returns false for unequal-length inputs
 * after doing a dummy comparison so timing is flat regardless of length.
 */
function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Dummy constant-time compare to keep timing flat.
    const pad = Buffer.alloc(ab.length);
    timingSafeEqual(ab, pad);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Verify that the request comes from an authenticated admin (Firebase Auth)
 * whose email is on the allowlist.
 *
 * Flow:
 *   1. Decode the Bearer ID token via Firebase Admin.
 *   2. Look up the decoded email in the `admins` Firestore collection.
 *   3. If missing, try the bootstrap path — when the collection is empty
 *      AND the email appears in `ADMIN_BOOTSTRAP_EMAILS`, seed the caller
 *      as the first admin and proceed. Otherwise, reject.
 *
 * An authenticated user whose email is not allow-listed resolves to
 * `null` — the caller-side code treats that identically to an
 * unauthenticated request (401).
 */
export async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email;
    if (!email) return null;

    if (await isAdminEmail(email)) return decoded;
    // Not in allowlist — try bootstrap seeding (no-op if collection non-empty
    // or email not in ADMIN_BOOTSTRAP_EMAILS).
    if (await bootstrapAdminIfEmpty(email)) return decoded;
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify that the request includes a valid camp code.
 * Expects X-Camp-Code header matching the stored camp code.
 * Uses constant-time comparison.
 */
export async function verifyTeacher(request: NextRequest): Promise<boolean> {
  const campCode = request.headers.get('X-Camp-Code');
  if (!campCode) return false;

  let expected: string | undefined;
  try {
    const configDoc = await adminDb.collection('config').doc('camp').get();
    expected = configDoc.exists ? configDoc.data()?.camp_code : process.env.CAMP_CODE;
  } catch {
    // Fall back to env var if Firestore is unreachable
    expected = process.env.CAMP_CODE;
  }
  return safeEqual(campCode, expected);
}

/**
 * Determine the caller's role from the request.
 * Checks admin auth first (higher privilege), then camp code.
 */
export async function getCallerRole(request: NextRequest): Promise<CallerRole> {
  const admin = await verifyAdmin(request);
  if (admin) return 'admin';

  const isTeacher = await verifyTeacher(request);
  if (isTeacher) return 'teacher';

  return null;
}
