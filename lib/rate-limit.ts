import { NextRequest } from 'next/server';
import { adminDb } from './firebase-admin';

/**
 * Best-effort per-key rate limiter. In-memory, single-instance only.
 * Use to throttle unauthenticated attempts on security-sensitive routes.
 *
 * Default: 5 hits per 60-second rolling window per key.
 */

const WINDOW_MS = 60_000;
const MAX_HITS = 5;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_HITS) return false;
  b.count += 1;
  return true;
}

export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export function _resetRateLimitForTests(): void {
  buckets.clear();
}

/**
 * DURABLE per-key limiter backed by Firestore — survives cold starts and is
 * shared across all SSR instances (the in-memory one above resets per instance,
 * so it can't bound a flood spread across the 5 max instances). Use for the
 * PUBLIC WRITE routes, keyed by TOKEN (not just IP) so rotating a spoofed
 * X-Forwarded-For can't get around the cap — every hit on one link/report
 * counts against the same bucket.
 *
 * Fail-OPEN: if Firestore errors we allow the request — a camp tool must not
 * lock out legitimate staff because of a transient infra blip.
 */
export async function checkRateLimitDurable(
  key: string,
  opts: { max: number; windowMs: number }
): Promise<boolean> {
  const id = key.replace(/[^\w.-]/g, '_').slice(0, 400);
  const ref = adminDb.collection('rate_limits').doc(id);
  const now = Date.now();
  try {
    return await adminDb.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const d = snap.exists ? (snap.data() as { count: number; resetAt: number }) : null;
      if (!d || now >= d.resetAt) {
        t.set(ref, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (d.count >= opts.max) return false;
      t.update(ref, { count: d.count + 1 });
      return true;
    });
  } catch {
    return true; // fail-open
  }
}
