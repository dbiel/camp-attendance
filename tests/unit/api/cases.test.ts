import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  listCases: vi.fn(),
  createCase: vi.fn(),
  getCase: vi.fn(),
  resolveCase: vi.fn(),
  addCaseEvent: vi.fn(),
  listCaseEvents: vi.fn(),
  listCasesForStudent: vi.fn(),
  getStudent: vi.fn(),
  getAdminRole: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/cases', () => ({
  listCases: m.listCases,
  createCase: m.createCase,
  getCase: m.getCase,
  resolveCase: m.resolveCase,
  addCaseEvent: m.addCaseEvent,
  listCaseEvents: m.listCaseEvents,
  listCasesForStudent: m.listCasesForStudent,
}));
vi.mock('@/lib/firestore', () => ({
  getAdminRole: m.getAdminRole,
  getStudent: m.getStudent,
}));
vi.mock('@/lib/auth', () => ({
  verifyAdmin: m.verifyAdmin,
  getCallerRole: vi.fn(),
}));

import { GET, POST } from '@/app/api/cases/route';
import { GET as GET_CASE, PATCH } from '@/app/api/cases/[id]/route';
import { POST as POST_EVENT } from '@/app/api/cases/[id]/events/route';

function req(method: string, body?: unknown, url = 'http://test/api/cases') {
  return new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.verifyAdmin.mockResolvedValue({ email: 'david@bieldentalcabinets.com' });
  m.getAdminRole.mockResolvedValue('super_admin');
});

describe('GET /api/cases', () => {
  it('returns active cases by default', async () => {
    m.listCases.mockResolvedValue([{ id: 'c1', status: 'active' }]);
    const res = await GET(req('GET'), { params: {} });
    expect(res.status).toBe(200);
    expect(m.listCases).toHaveBeenCalledWith('active');
  });
  it('returns resolved cases with ?status=resolved', async () => {
    m.listCases.mockResolvedValue([]);
    await GET(req('GET', undefined, 'http://test/api/cases?status=resolved'), { params: {} });
    expect(m.listCases).toHaveBeenCalledWith('resolved');
  });
  it('403s for dorm_admin', async () => {
    m.getAdminRole.mockResolvedValue('dorm_admin');
    const res = await GET(req('GET'), { params: {} });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/cases', () => {
  it('validates the student exists and creates the case', async () => {
    m.getStudent.mockResolvedValue({ id: 's1', first_name: 'Johnny', last_name: 'Smith' });
    m.createCase.mockResolvedValue('case1');
    const res = await POST(
      req('POST', { student_id: 's1', summary: 'missing', raw_text: 'raw' }),
      { params: {} }
    );
    expect(res.status).toBe(200);
    expect(m.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 's1', student_name: 'Johnny Smith', created_by: 'david@bieldentalcabinets.com' })
    );
  });
  it('400s on unknown student', async () => {
    m.getStudent.mockResolvedValue(undefined);
    const res = await POST(req('POST', { student_id: 'nope', summary: 'x', raw_text: 'y' }), { params: {} });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/cases/[id]', () => {
  it('404s on unknown case', async () => {
    m.getCase.mockResolvedValue(null);
    const res = await GET_CASE(req('GET', undefined, 'http://test/api/cases/nope'), { params: { id: 'nope' } });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/cases/[id]', () => {
  it('400s on missing resolution_note', async () => {
    const res = await PATCH(req('PATCH', {}, 'http://test/api/cases/c1'), { params: { id: 'c1' } });
    expect(res.status).toBe(400);
    expect(m.resolveCase).not.toHaveBeenCalled();
  });
  it('409s on already-resolved case', async () => {
    m.getCase.mockResolvedValue({ id: 'c1', status: 'resolved' });
    const res = await PATCH(
      req('PATCH', { resolution_note: 'found him' }, 'http://test/api/cases/c1'),
      { params: { id: 'c1' } }
    );
    expect(res.status).toBe(409);
    expect(m.resolveCase).not.toHaveBeenCalled();
  });
});

describe('POST /api/cases/[id]/events', () => {
  it('400s on disallowed type', async () => {
    const res = await POST_EVENT(
      req('POST', { type: 'resolved', body: 'note text' }, 'http://test/api/cases/c1/events'),
      { params: { id: 'c1' } }
    );
    expect(res.status).toBe(400);
    expect(m.addCaseEvent).not.toHaveBeenCalled();
  });
  it('400s on empty body', async () => {
    const res = await POST_EVENT(
      req('POST', { type: 'note', body: '   ' }, 'http://test/api/cases/c1/events'),
      { params: { id: 'c1' } }
    );
    expect(res.status).toBe(400);
    expect(m.addCaseEvent).not.toHaveBeenCalled();
  });
});
