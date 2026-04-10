import { NextRequest, NextResponse } from 'next/server';
import { getCallerRole, CallerRole } from './auth';
import { checkRateLimit, getClientIp } from './rate-limit';

export type RequiredRole = 'admin' | 'teacher';

export interface AuthedHandlerContext<P = Record<string, string>> {
  params: P;
  role: Exclude<CallerRole, null>;
}

export type AuthedHandler<P = Record<string, string>> = (
  request: NextRequest,
  context: AuthedHandlerContext<P>
) => Promise<Response> | Response;

export type RouteContext<P = Record<string, string>> = { params: P };

export interface WithAuthOptions {
  /**
   * Rate-limit key prefix for unauthenticated attempts. When set, the
   * wrapper runs `checkRateLimit(<prefix>:<ip>)` on any request that
   * fails auth and returns 429 instead of 401 when the bucket is full.
   * Only unauth attempts are throttled — authorized callers are never
   * rate-limited.
   */
  rateLimitKey?: string;
}

/**
 * Wraps an App Router route handler with role-based auth.
 * - Returns 401 if caller has no role.
 * - Returns 403 if caller's role is insufficient for the requirement.
 * - Returns 429 if unauth attempts exceed the rate limit (when key set).
 * - Returns 500 on any thrown error (logs via console.error).
 *
 * Role hierarchy: admin > teacher. Requiring 'teacher' accepts both.
 */
export function withAuth<P = Record<string, string>>(
  required: RequiredRole,
  handler: AuthedHandler<P>,
  options: WithAuthOptions = {}
) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      const role = await getCallerRole(request);

      if (!role) {
        if (options.rateLimitKey) {
          const ip = getClientIp(request);
          if (!checkRateLimit(`${options.rateLimitKey}:${ip}`)) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
          }
        }
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (required === 'admin' && role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      return await handler(request, { params: context.params, role });
    } catch (error) {
      console.error('[withAuth] handler error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
