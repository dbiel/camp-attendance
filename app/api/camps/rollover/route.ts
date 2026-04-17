import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { loadActiveCampServer } from '@/lib/camp-config';
import { performRollover } from '@/lib/firestore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/camps/rollover
 *
 * Admin-only. Archives the current camp's attendance + session enrollment
 * under `camps/{oldId}/…`, clears live collections, and advances
 * `config/camp` to a new year with a fresh camp_code. Students, faculty,
 * periods, and sessions persist year-over-year.
 *
 * Request body:
 *   new_year:                   "2027"   (required, must be > old year)
 *   new_start_date:             ISO YYYY-MM-DD  (required)
 *   new_end_date:               ISO YYYY-MM-DD  (required, >= start)
 *   new_timezone:               IANA string     (required)
 *   clear_ensemble_assignments: boolean (default true)
 *   dry_run:                    boolean (default false)
 *
 * Response (200):
 *   { dry_run, old_id, new_id, new_camp_code, archived, cleared }
 *
 * Safety notes:
 *   - Archive writes use fixed doc ids and are idempotent. Mid-archive
 *     failure is safe to retry.
 *   - Live collections are only cleared after archive counts match live
 *     counts. A mismatch aborts before any destructive write.
 *   - Mid-clear failure leaves the archive intact; re-running with
 *     dry_run=true shows the remaining live count for diagnosis.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  // Guard against calendar rollovers like 2026-02-31 → March.
  return d.toISOString().slice(0, 10) === s;
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
    return true;
  } catch {
    return false;
  }
}

export const POST = withAuth(
  'admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;

    if (typeof raw.new_year !== 'string' || raw.new_year.trim().length === 0) {
      return NextResponse.json(
        { error: 'new_year is required (4-digit year string)' },
        { status: 400 }
      );
    }
    if (!YEAR_RE.test(raw.new_year)) {
      return NextResponse.json(
        { error: 'new_year must be a 4-digit year (e.g. "2027")' },
        { status: 400 }
      );
    }
    const newYear = raw.new_year;
    const newYearNum = Number.parseInt(newYear, 10);

    if (typeof raw.new_start_date !== 'string' || !isValidIsoDate(raw.new_start_date)) {
      return NextResponse.json(
        { error: 'new_start_date must be ISO YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (typeof raw.new_end_date !== 'string' || !isValidIsoDate(raw.new_end_date)) {
      return NextResponse.json(
        { error: 'new_end_date must be ISO YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (raw.new_end_date < raw.new_start_date) {
      return NextResponse.json(
        { error: 'new_end_date must be on or after new_start_date' },
        { status: 400 }
      );
    }
    if (typeof raw.new_timezone !== 'string' || !isValidTimezone(raw.new_timezone)) {
      return NextResponse.json(
        { error: 'new_timezone must be a valid IANA identifier (e.g. America/Chicago)' },
        { status: 400 }
      );
    }

    // Cross-check against the current camp year so the client can't skip
    // backwards. The firestore helper enforces this again, but returning
    // 400 here is clearer than 500 from the worker.
    let oldYear: number;
    let oldId: string;
    try {
      const cfg = await loadActiveCampServer();
      oldYear = cfg.camp_year;
      oldId = cfg.camp_id;
    } catch (error) {
      console.error('[POST /api/camps/rollover] failed to load active camp:', error);
      return NextResponse.json(
        { error: 'Failed to load active camp config' },
        { status: 500 }
      );
    }

    if (newYearNum <= oldYear) {
      return NextResponse.json(
        {
          error:
            `new_year (${newYear}) must be greater than the current camp year ` +
            `(${oldYear}) — rollover cannot move backwards`,
        },
        { status: 400 }
      );
    }

    const dryRun = raw.dry_run === true;
    const clearEnsembleAssignments =
      raw.clear_ensemble_assignments === false ? false : true;

    try {
      const result = await performRollover({
        newYear,
        newStartDate: raw.new_start_date,
        newEndDate: raw.new_end_date,
        newTimezone: raw.new_timezone,
        clearEnsembleAssignments,
        dryRun,
      });
      return NextResponse.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[POST /api/camps/rollover] failed old_id=${oldId} new_year=${newYear} dry_run=${dryRun}:`,
        error
      );
      return NextResponse.json(
        { error: `Rollover failed: ${msg}` },
        { status: 500 }
      );
    }
  },
  { rateLimitKey: 'rollover' }
);
