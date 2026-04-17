import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  performRolloverMock,
  loadActiveCampServerMock,
  verifyIdTokenMock,
} = vi.hoisted(() => ({
  performRolloverMock: vi.fn(),
  loadActiveCampServerMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  performRollover: performRolloverMock,
  isAdminEmail: vi.fn().mockResolvedValue(true),
  bootstrapAdminIfEmpty: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/camp-config', () => ({
  loadActiveCampServer: loadActiveCampServerMock,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  },
}));

import { POST } from '@/app/api/camps/rollover/route';
import { _resetRateLimitForTests } from '@/lib/rate-limit';

const CTX = { params: {} };

const CURRENT_CONFIG = {
  camp_id: '2026',
  camp_code: 'ABCD2345',
  camp_year: 2026,
  start_date: '2026-06-08',
  end_date: '2026-06-13',
  timezone: 'America/Chicago',
  day_dates: { M: '2026-06-08', T: '2026-06-09' },
};

const VALID_BODY = {
  new_year: '2027',
  new_start_date: '2027-06-07',
  new_end_date: '2027-06-12',
  new_timezone: 'America/Chicago',
};

function post(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer fake' }) {
  return new NextRequest('http://localhost/api/camps/rollover', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  });
}

function noAuthPost(body: unknown) {
  return new NextRequest('http://localhost/api/camps/rollover', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/camps/rollover', () => {
  beforeEach(() => {
    performRolloverMock.mockReset();
    performRolloverMock.mockResolvedValue({
      dry_run: false,
      old_id: '2026',
      new_id: '2027',
      new_camp_code: 'XYZ23456',
      archived: { attendance: 10, session_students: 5 },
      cleared: { attendance: 10, session_students: 5 },
    });
    loadActiveCampServerMock.mockReset();
    loadActiveCampServerMock.mockResolvedValue(CURRENT_CONFIG);
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', email: 'a@b.com' });
    _resetRateLimitForTests();
    process.env.CAMP_CODE = 'teachercode';
  });

  it('returns 401 when no auth', async () => {
    const res = await POST(noAuthPost(VALID_BODY), CTX);
    expect(res.status).toBe(401);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 403 for teacher role', async () => {
    const res = await POST(post(VALID_BODY, { 'X-Camp-Code': 'teachercode' }), CTX);
    expect(res.status).toBe(403);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not JSON', async () => {
    const req = new NextRequest('http://localhost/api/camps/rollover', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        Authorization: 'Bearer fake',
      }),
      body: 'not json',
    });
    const res = await POST(req, CTX);
    expect(res.status).toBe(400);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_year is missing', async () => {
    const { new_year: _unused, ...rest } = VALID_BODY;
    const res = await POST(post(rest), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('new_year');
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_start_date is missing', async () => {
    const { new_start_date: _unused, ...rest } = VALID_BODY;
    const res = await POST(post(rest), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('new_start_date');
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_end_date is missing', async () => {
    const { new_end_date: _unused, ...rest } = VALID_BODY;
    const res = await POST(post(rest), CTX);
    expect(res.status).toBe(400);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_timezone is missing', async () => {
    const { new_timezone: _unused, ...rest } = VALID_BODY;
    const res = await POST(post(rest), CTX);
    expect(res.status).toBe(400);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_year is not a 4-digit year', async () => {
    const res = await POST(post({ ...VALID_BODY, new_year: '27' }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('new_year');
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_year <= current year', async () => {
    const res = await POST(post({ ...VALID_BODY, new_year: '2026' }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/new_year|greater|old/);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_year is before current year', async () => {
    const res = await POST(post({ ...VALID_BODY, new_year: '2025' }), CTX);
    expect(res.status).toBe(400);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid timezone', async () => {
    const res = await POST(post({ ...VALID_BODY, new_timezone: 'Not/A_Real_Zone' }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain('timezone');
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 when new_end_date is before new_start_date', async () => {
    const res = await POST(
      post({ ...VALID_BODY, new_start_date: '2027-06-12', new_end_date: '2027-06-07' }),
      CTX
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/end_date|start_date|order/);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 400 on bad ISO date format', async () => {
    const res = await POST(post({ ...VALID_BODY, new_start_date: '6/8/2027' }), CTX);
    expect(res.status).toBe(400);
    expect(performRolloverMock).not.toHaveBeenCalled();
  });

  it('returns 200 on happy path and forwards opts to performRollover', async () => {
    const res = await POST(post(VALID_BODY), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.old_id).toBe('2026');
    expect(body.new_id).toBe('2027');
    expect(body.new_camp_code).toBe('XYZ23456');
    expect(body.archived).toEqual({ attendance: 10, session_students: 5 });
    expect(body.cleared).toEqual({ attendance: 10, session_students: 5 });
    expect(body.dry_run).toBe(false);
    expect(performRolloverMock).toHaveBeenCalledTimes(1);
    const call = performRolloverMock.mock.calls[0]![0];
    expect(call.newYear).toBe('2027');
    expect(call.newStartDate).toBe('2027-06-07');
    expect(call.newEndDate).toBe('2027-06-12');
    expect(call.newTimezone).toBe('America/Chicago');
    expect(call.dryRun).toBe(false);
    // Default is to clear ensembles.
    expect(call.clearEnsembleAssignments).toBe(true);
  });

  it('forwards clear_ensemble_assignments=false when provided', async () => {
    const res = await POST(
      post({ ...VALID_BODY, clear_ensemble_assignments: false }),
      CTX
    );
    expect(res.status).toBe(200);
    const call = performRolloverMock.mock.calls[0]![0];
    expect(call.clearEnsembleAssignments).toBe(false);
  });

  it('returns 200 and echoes dry_run=true when dry_run provided', async () => {
    performRolloverMock.mockResolvedValue({
      dry_run: true,
      old_id: '2026',
      new_id: '2027',
      new_camp_code: '',
      archived: { attendance: 10, session_students: 5 },
      cleared: { attendance: 0, session_students: 0 },
    });
    const res = await POST(post({ ...VALID_BODY, dry_run: true }), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.cleared).toEqual({ attendance: 0, session_students: 0 });
    const call = performRolloverMock.mock.calls[0]![0];
    expect(call.dryRun).toBe(true);
  });

  it('returns 500 when performRollover throws', async () => {
    performRolloverMock.mockRejectedValue(new Error('archive count mismatch'));
    const res = await POST(post(VALID_BODY), CTX);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
