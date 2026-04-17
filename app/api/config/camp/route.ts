import { NextRequest, NextResponse } from 'next/server';
import { getCallerRole } from '@/lib/auth';
import { loadActiveCampServer, toPublicCampConfig } from '@/lib/camp-config';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { withAuth } from '@/lib/with-auth';
import { setCampConfig } from '@/lib/firestore';
import type { CampConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`config-camp:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cfg = await loadActiveCampServer();
    if (role === 'teacher') {
      return NextResponse.json(toPublicCampConfig(cfg));
    }
    return NextResponse.json(cfg);
  } catch (error) {
    console.error('Error loading camp config:', error);
    return NextResponse.json({ error: 'Failed to load camp config' }, { status: 500 });
  }
}

// ─── PUT /api/config/camp ──────────────────────────────────────────────
// Admin-only. Accepts a partial CampConfig body and merges it into the
// active `config/camp` doc. Rejects attempts to set camp_code (rotation
// is a dedicated endpoint) or camp_id (year is immutable per config doc).

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  // Guard against `2026-02-31` round-tripping into March.
  return d.toISOString().slice(0, 10) === s;
}

function isValidTimezone(tz: string): boolean {
  try {
    // Throws RangeError on invalid IANA identifier.
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
    return true;
  } catch {
    return false;
  }
}

export const PUT = withAuth(
  'admin',
  async (request: NextRequest) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;

    // Explicitly reject immutable / privileged fields.
    if ('camp_code' in raw) {
      return NextResponse.json(
        { error: 'camp_code cannot be set via this endpoint — use /api/config/camp-code/rotate' },
        { status: 400 }
      );
    }
    if ('camp_id' in raw || 'camp_year' in raw) {
      return NextResponse.json(
        { error: 'camp_id and camp_year are immutable — use the rollover endpoint to start a new year' },
        { status: 400 }
      );
    }

    const partial: Partial<CampConfig> = {};

    if ('name' in raw) {
      // CampConfig type doesn't currently have `name`, but accept it if
      // provided so callers migrating to a newer schema don't 400.
      if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      (partial as Record<string, unknown>).name = raw.name.trim();
    }

    if ('start_date' in raw) {
      if (typeof raw.start_date !== 'string' || !isValidIsoDate(raw.start_date)) {
        return NextResponse.json(
          { error: 'start_date must be ISO YYYY-MM-DD' },
          { status: 400 }
        );
      }
      partial.start_date = raw.start_date;
    }

    if ('end_date' in raw) {
      if (typeof raw.end_date !== 'string' || !isValidIsoDate(raw.end_date)) {
        return NextResponse.json(
          { error: 'end_date must be ISO YYYY-MM-DD' },
          { status: 400 }
        );
      }
      partial.end_date = raw.end_date;
    }

    if (partial.start_date && partial.end_date && partial.end_date < partial.start_date) {
      return NextResponse.json(
        { error: 'end_date must be on or after start_date' },
        { status: 400 }
      );
    }

    if ('timezone' in raw) {
      if (typeof raw.timezone !== 'string' || !isValidTimezone(raw.timezone)) {
        return NextResponse.json(
          { error: 'timezone must be a valid IANA identifier (e.g. America/Chicago)' },
          { status: 400 }
        );
      }
      partial.timezone = raw.timezone;
    }

    if ('day_dates' in raw) {
      const dd = raw.day_dates;
      if (!dd || typeof dd !== 'object' || Array.isArray(dd)) {
        return NextResponse.json(
          { error: 'day_dates must be an object mapping day keys to ISO dates' },
          { status: 400 }
        );
      }
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(dd as Record<string, unknown>)) {
        if (typeof k !== 'string' || k.length === 0 || k.length > 4) {
          return NextResponse.json(
            { error: `day_dates key "${k}" must be a short non-empty string` },
            { status: 400 }
          );
        }
        if (typeof v !== 'string' || !isValidIsoDate(v)) {
          return NextResponse.json(
            { error: `day_dates.${k} must be ISO YYYY-MM-DD` },
            { status: 400 }
          );
        }
        normalized[k] = v;
      }
      partial.day_dates = normalized;
    }

    if (Object.keys(partial).length === 0) {
      return NextResponse.json({ error: 'no valid fields provided' }, { status: 400 });
    }

    try {
      const updated = await setCampConfig(partial);
      return NextResponse.json(updated);
    } catch (error) {
      console.error('[PUT /api/config/camp] setCampConfig failed:', error);
      return NextResponse.json({ error: 'Failed to update camp config' }, { status: 500 });
    }
  },
  { rateLimitKey: 'config-camp' }
);
