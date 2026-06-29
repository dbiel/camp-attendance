import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  issueEnsembleLink: vi.fn(),
  issueSelectorLink: vi.fn(),
  listEnsembleLinks: vi.fn(async () => []),
  listSelectorLinks: vi.fn(async () => [{ token: 'sel', allowed: [], label: null, created_at: 'z', revoked: false }]),
  listEnsembles: vi.fn(async () => [{ ensemble: 'Band 1', count: 73 }]),
}));
vi.mock('@/lib/with-auth', () => ({ withAuth: (_role: string, fn: unknown) => fn }));
vi.mock('@/lib/ensemble-links', () => ({
  issueEnsembleLink: h.issueEnsembleLink,
  issueSelectorLink: h.issueSelectorLink,
  listEnsembleLinks: h.listEnsembleLinks,
  listSelectorLinks: h.listSelectorLinks,
  listEnsembles: h.listEnsembles,
}));

import { GET, POST } from '@/app/api/admin/ensemble-links/route';

const post = (body: unknown) => ({ json: async () => body }) as unknown as Request;

beforeEach(() => {
  h.issueSelectorLink.mockReset().mockResolvedValue({ token: 'newsel', url: '/e/pick/newsel' });
  h.issueEnsembleLink.mockReset().mockResolvedValue({ token: 'e1', url: '/e/e1', ensemble: 'Band 1' });
});

describe('admin ensemble-links selector support', () => {
  it('GET includes selectorLinks', async () => {
    const res = await (GET as unknown as (r: Request) => Promise<Response>)({} as Request);
    const body = await res.json();
    expect(body.selectorLinks).toEqual([{ token: 'sel', allowed: [], label: null, created_at: 'z', revoked: false }]);
  });
  it('POST kind=selector issues a picker link', async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(post({ kind: 'selector', label: 'Front desk' }));
    expect(await res.json()).toEqual({ token: 'newsel', url: '/e/pick/newsel' });
    expect(h.issueSelectorLink).toHaveBeenCalledWith('Front desk');
    expect(h.issueEnsembleLink).not.toHaveBeenCalled();
  });
  it('POST without kind still issues a per-ensemble link', async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(post({ ensemble: 'Band 1' }));
    expect(await res.json()).toEqual({ token: 'e1', url: '/e/e1', ensemble: 'Band 1' });
    expect(h.issueEnsembleLink).toHaveBeenCalled();
    expect(h.issueSelectorLink).not.toHaveBeenCalled();
  });
});
