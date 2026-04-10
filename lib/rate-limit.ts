import { NextRequest } from 'next/server';

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
