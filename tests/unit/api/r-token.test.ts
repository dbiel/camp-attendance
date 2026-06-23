import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  validateShareToken: vi.fn(),
  getCase: vi.fn(),
  listCaseEvents: vi.fn(),
  addCaseEvent: vi.fn(),
  getStudent: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock('@/lib/cases', () => ({
  validateShareToken: m.validateShareToken,
  getCase: m.getCase,
  listCaseEvents: m.listCaseEvents,
  addCaseEvent: m.addCaseEvent,
}));
vi.mock('@/lib/firestore', () => ({ getStudent: m.getStudent }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: m.checkRateLimit,
  getClientIp: m.getClientIp,
}));

import { GET } from '@/app/api/r/[token]/route';
import { POST } from '@/app/api/r/[token]/update/route';

function req(method: string, body?: unknown) {
  return new NextRequest('http://test/api/r/tok', {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
  });
}

const validCase = {
  id: 'case1',
  status: 'active',
  student_id: 'st1',
  summary: 'Missing from sectional',
  share_recipient_label: 'Counselor Jane',
  raw_text: 'SENSITIVE raw text',
};
const student = {
  id: 'st1',
  first_name: 'Johnny',
  last_name: 'Appleseed',
  instrument: 'Trumpet',
  dorm_room: 'Hall-204',
  medical_notes: 'Peanut allergy',
  parent_phone: '+18065559999',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.checkRateLimit.mockReturnValue(true);
  m.getClientIp.mockReturnValue('1.2.3.4');
});

describe('GET /api/r/[token]', () => {
  it('returns the scoped projection (and ONLY that) for a valid token', async () => {
    m.validateShareToken.mockResolvedValue({ caseId: 'case1' });
    m.getCase.mockResolvedValue(validCase);
    m.getStudent.mockResolvedValue(student);
    m.listCaseEvents.mockResolvedValue([
      { id: 'e1', case_id: 'case1', type: 'staff_update', body: 'looked in dorm', actor: 'Counselor Jane', created_at: '2026-06-22T12:30:00.000Z' },
      { id: 'e2', case_id: 'case1', type: 'note', body: 'INTERNAL', actor: 'david', created_at: '2026-06-22T12:31:00.000Z' },
    ]);
    const res = await GET(req('GET'), { params: { token: 'tok' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Object.keys(data).sort()).toEqual(
      ['dorm_room', 'first_name', 'instrument', 'last_initial', 'report_summary', 'status', 'updates'].sort()
    );
    const blob = JSON.stringify(data);
    expect(blob).not.toContain('Appleseed');
    expect(blob).not.toContain('Peanut');
    expect(blob).not.toContain('+18065559999');
    expect(blob).not.toContain('SENSITIVE');
    expect(blob).not.toContain('INTERNAL');
    expect(blob).not.toContain('case1'); // no internal id leak
  });

  it('returns a uniform 404 for an unknown token (no enumeration)', async () => {
    m.validateShareToken.mockResolvedValue(null);
    const res = await GET(req('GET'), { params: { token: 'nope' } });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).not.toHaveProperty('first_name');
  });

  it('returns the SAME uniform failure for expired/revoked as for unknown', async () => {
    m.validateShareToken.mockResolvedValue(null); // validate treats all three the same
    const unknownRes = await GET(req('GET'), { params: { token: 'nope' } });
    const expiredRes = await GET(req('GET'), { params: { token: 'expired' } });
    expect(unknownRes.status).toBe(expiredRes.status);
    expect(await unknownRes.json()).toEqual(await expiredRes.json());
  });

  it('returns 429 when rate-limited', async () => {
    m.checkRateLimit.mockReturnValue(false);
    const res = await GET(req('GET'), { params: { token: 'tok' } });
    expect(res.status).toBe(429);
    expect(m.validateShareToken).not.toHaveBeenCalled();
  });
});

describe('POST /api/r/[token]/update', () => {
  it('appends a staff_update event with actor = recipient_label for a valid token', async () => {
    m.validateShareToken.mockResolvedValue({ caseId: 'case1' });
    m.getCase.mockResolvedValue(validCase);
    m.addCaseEvent.mockResolvedValue('e9');
    const res = await POST(req('POST', { body: 'Found him at the dining hall' }), { params: { token: 'tok' } });
    expect(res.status).toBe(200);
    expect(m.addCaseEvent).toHaveBeenCalledWith('case1', 'staff_update', 'Found him at the dining hall', 'Counselor Jane');
  });

  it('uses "staff link" as actor when no recipient label', async () => {
    m.validateShareToken.mockResolvedValue({ caseId: 'case1' });
    m.getCase.mockResolvedValue({ ...validCase, share_recipient_label: null });
    m.addCaseEvent.mockResolvedValue('e9');
    await POST(req('POST', { body: 'an update' }), { params: { token: 'tok' } });
    expect(m.addCaseEvent).toHaveBeenCalledWith('case1', 'staff_update', 'an update', 'staff link');
  });

  it('400s on empty body', async () => {
    m.validateShareToken.mockResolvedValue({ caseId: 'case1' });
    m.getCase.mockResolvedValue(validCase);
    const res = await POST(req('POST', { body: '   ' }), { params: { token: 'tok' } });
    expect(res.status).toBe(400);
    expect(m.addCaseEvent).not.toHaveBeenCalled();
  });

  it('returns 410 when the link has expired/revoked (validate → null)', async () => {
    m.validateShareToken.mockResolvedValue(null);
    const res = await POST(req('POST', { body: 'too late' }), { params: { token: 'tok' } });
    expect(res.status).toBe(410);
    expect(m.addCaseEvent).not.toHaveBeenCalled();
  });

  it('returns 429 when rate-limited', async () => {
    m.checkRateLimit.mockReturnValue(false);
    const res = await POST(req('POST', { body: 'x' }), { params: { token: 'tok' } });
    expect(res.status).toBe(429);
    expect(m.validateShareToken).not.toHaveBeenCalled();
  });
});
