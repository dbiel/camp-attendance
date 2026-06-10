import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docGetMock, docSetMock, docPathMock } = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
  docPathMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (path: string) => {
        docPathMock(path);
        return { get: docGetMock, set: docSetMock };
      },
      limit: () => ({ get: async () => ({ empty: false }) }),
    }),
  },
  adminAuth: {},
}));

import { getAdminRole, addAdmin } from '@/lib/firestore';

describe('getAdminRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when the admin doc does not exist', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    expect(await getAdminRole('nobody@example.com')).toBeNull();
  });

  it('defaults to super_admin when role field is missing (legacy docs)', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ added_by: 'x' }) });
    expect(await getAdminRole('david@example.com')).toBe('super_admin');
  });

  it('returns dorm_admin when set', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'dorm_admin' }) });
    expect(await getAdminRole('john@example.com')).toBe('dorm_admin');
  });

  it('returns null for unrecognized role values (fail closed)', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'viewer' }) });
    expect(await getAdminRole('typo@example.com')).toBeNull();
  });

  it('lowercases the email for lookup', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    expect(await getAdminRole('MiXeD@Example.COM')).toBeNull();
    expect(docPathMock).toHaveBeenCalledWith('mixed@example.com');
  });
});

describe('addAdmin role param', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes role super_admin by default', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    await addAdmin('new@example.com', 'david@example.com');
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'super_admin' })
    );
  });

  it('writes dorm_admin when specified', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    await addAdmin('john@example.com', 'david@example.com', 'dorm_admin');
    expect(docSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'dorm_admin' })
    );
  });
});
