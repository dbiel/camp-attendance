import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createUser, getUserByEmail, updateUser, generatePasswordResetLink, addAdmin } =
  vi.hoisted(() => ({
    createUser: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUser: vi.fn(),
    generatePasswordResetLink: vi.fn(),
    addAdmin: vi.fn(),
  }));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { createUser, getUserByEmail, updateUser, generatePasswordResetLink },
  adminDb: {},
}));

vi.mock('@/lib/firestore', () => ({ addAdmin }));

import {
  slugifyName,
  mintLoginHandle,
  createPasswordAdmin,
  resetAdminPassword,
} from '@/lib/admin-users';

beforeEach(() => {
  vi.clearAllMocks();
  generatePasswordResetLink.mockResolvedValue('https://reset.link/abc');
  getUserByEmail.mockRejectedValue(new Error('auth/user-not-found'));
});

describe('slugifyName', () => {
  it('produces a dotted lowercase slug', () => {
    expect(slugifyName('Jane  Smith')).toBe('jane.smith');
    expect(slugifyName("O'Brien, Pat")).toBe('o.brien.pat');
  });
});

describe('mintLoginHandle', () => {
  it('returns base handle when free', async () => {
    getUserByEmail.mockRejectedValue(new Error('not found'));
    expect(await mintLoginHandle('Jane Smith')).toBe('jane.smith@camp.local');
  });

  it('dedupes against an existing handle', async () => {
    getUserByEmail
      .mockResolvedValueOnce({ uid: 'u1' }) // jane.smith@camp.local taken
      .mockRejectedValueOnce(new Error('not found')); // jane.smith2 free
    expect(await mintLoginHandle('Jane Smith')).toBe('jane.smith2@camp.local');
  });
});

describe('createPasswordAdmin', () => {
  it('temp_password: creates auth user + password allowlist doc', async () => {
    const res = await createPasswordAdmin({
      name: 'Jane Smith',
      email: 'jane@church.org',
      role: 'lookup_admin',
      mode: 'temp_password',
      password: 'startpass1',
      addedBy: 'david@x.com',
    });
    expect(res).toEqual({ email: 'jane@church.org' });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@church.org', password: 'startpass1' })
    );
    expect(addAdmin).toHaveBeenCalledWith(
      'jane@church.org',
      'david@x.com',
      'lookup_admin',
      expect.objectContaining({ auth_type: 'password', name: 'Jane Smith' })
    );
    expect(generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it('temp_password: rejects a short password', async () => {
    await expect(
      createPasswordAdmin({
        name: 'Jane',
        role: 'lookup_admin',
        mode: 'temp_password',
        password: 'short',
        addedBy: 'd',
      })
    ).rejects.toThrow(/8 characters/);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('setup_link: mints a handle when no email, returns a setup link', async () => {
    const res = await createPasswordAdmin({
      name: 'Pat Jones',
      role: 'lookup_admin',
      mode: 'setup_link',
      addedBy: 'david@x.com',
    });
    expect(res.email).toBe('pat.jones@camp.local');
    expect(res.setup_link).toBe('https://reset.link/abc');
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'pat.jones@camp.local' })
    );
  });
});

describe('resetAdminPassword', () => {
  it('temp_password: updates the user password', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u9' });
    const res = await resetAdminPassword('jane@church.org', 'temp_password', 'newpass12');
    expect(updateUser).toHaveBeenCalledWith('u9', { password: 'newpass12' });
    expect(res).toEqual({});
  });

  it('setup_link: returns a fresh reset link', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u9' });
    const res = await resetAdminPassword('jane@church.org', 'setup_link');
    expect(res.setup_link).toBe('https://reset.link/abc');
  });
});
