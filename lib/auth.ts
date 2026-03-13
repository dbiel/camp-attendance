import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from './firebase-admin';

export type CallerRole = 'admin' | 'teacher' | null;

/**
 * Verify that the request comes from an authenticated admin (Firebase Auth).
 * Expects Authorization: Bearer <idToken> header.
 * Returns the decoded token or null.
 */
export async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify that the request includes a valid camp code.
 * Expects X-Camp-Code header matching the stored camp code.
 */
export async function verifyTeacher(request: NextRequest): Promise<boolean> {
  const campCode = request.headers.get('X-Camp-Code');
  if (!campCode) return false;

  try {
    const configDoc = await adminDb.collection('config').doc('camp').get();
    if (!configDoc.exists) {
      // Fall back to env var
      return campCode === process.env.CAMP_CODE;
    }
    return campCode === configDoc.data()?.camp_code;
  } catch {
    // Fall back to env var if Firestore is unreachable
    return campCode === process.env.CAMP_CODE;
  }
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
