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
