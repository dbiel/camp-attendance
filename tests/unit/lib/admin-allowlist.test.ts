/**
 * Admin Allowlist Unit Tests
 *
 * Tests the Firestore-backed admin email allowlist helpers:
 *   - isAdminEmail
 *   - bootstrapAdminIfEmpty
 *   - listAdmins
 *   - addAdmin
 *   - removeAdmin
 *
 * Uses a minimal mocked adminDb that tracks documents in-memory so we can
 * assert behavior around an empty collection, the bootstrap path, and
 * standard CRUD.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory docs map, shared across the mock — keyed by doc id (lowercased email).
const docs = new Map<string, Record<string, unknown>>();

function makeDocRef(id: string) {
  return {
    id,
    get: async () => ({
      exists: docs.has(id),
      data: () => docs.get(id),
      id,
    }),
    set: async (data: Record<string, unknown>) => {
      docs.set(id, data);
    },
    delete: async () => {
      docs.delete(id);
    },
  };
}

function makeCollection() {
  return {
    doc: (id: string) => makeDocRef(id),
    get: async () => ({
      empty: docs.size === 0,
      size: docs.size,
      docs: Array.from(docs.entries()).map(([id, data]) => ({
        id,
        data: () => data,
      })),
    }),
    // `.limit(1).get()` for cheap emptiness checks
    limit: (_n: number) => ({
      get: async () => ({
        empty: docs.size === 0,
        size: Math.min(docs.size, _n),
        docs: Array.from(docs.entries())
          .slice(0, _n)
          .map(([id, data]) => ({ id, data: () => data })),
      }),
    }),
  };
}

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name !== 'admins') {
        throw new Error(`unexpected collection ${name}`);
      }
      return makeCollection();
    },
  },
}));

import {
  isAdminEmail,
  bootstrapAdminIfEmpty,
  listAdmins,
  addAdmin,
  removeAdmin,
} from '@/lib/firestore';

beforeEach(() => {
  docs.clear();
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
});

describe('isAdminEmail', () => {
  it('returns true for existing email (case-insensitive)', async () => {
    docs.set('alice@test.com', {
      email: 'alice@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });
    expect(await isAdminEmail('alice@test.com')).toBe(true);
    expect(await isAdminEmail('ALICE@TEST.COM')).toBe(true);
  });

  it('returns false for unknown email when collection has others', async () => {
    docs.set('alice@test.com', {
      email: 'alice@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });
    expect(await isAdminEmail('bob@test.com')).toBe(false);
  });

  it('returns true for bootstrap email when collection empty', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com, other@test.com';
    expect(await isAdminEmail('admin@test.com')).toBe(true);
    expect(await isAdminEmail('ADMIN@TEST.COM')).toBe(true);
    expect(await isAdminEmail('other@test.com')).toBe(true);
  });

  it('returns false for non-bootstrap email when collection empty', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    expect(await isAdminEmail('mallory@test.com')).toBe(false);
  });

  it('returns false for bootstrap email when collection NOT empty', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    docs.set('someoneelse@test.com', {
      email: 'someoneelse@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });
    // Bootstrap only applies to seeding an empty collection.
    expect(await isAdminEmail('admin@test.com')).toBe(false);
  });

  it('returns false when env var unset and collection empty (hostile state)', async () => {
    expect(await isAdminEmail('anyone@test.com')).toBe(false);
  });

  it('does not write when bootstrap email matches (pure read)', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    await isAdminEmail('admin@test.com');
    expect(docs.size).toBe(0);
  });
});

describe('bootstrapAdminIfEmpty', () => {
  it('writes admins/{email} and returns true when collection empty + email allowed', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    const seeded = await bootstrapAdminIfEmpty('ADMIN@test.com');
    expect(seeded).toBe(true);
    expect(docs.has('admin@test.com')).toBe(true);
    const d = docs.get('admin@test.com')!;
    expect(d.email).toBe('admin@test.com');
    expect(d.added_by).toBe('bootstrap');
    expect(typeof d.added_at).toBe('number');
  });

  it('returns false when email not in env list', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    const seeded = await bootstrapAdminIfEmpty('mallory@test.com');
    expect(seeded).toBe(false);
    expect(docs.size).toBe(0);
  });

  it('returns false when env var unset', async () => {
    const seeded = await bootstrapAdminIfEmpty('admin@test.com');
    expect(seeded).toBe(false);
    expect(docs.size).toBe(0);
  });

  it('returns false when collection is not empty', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    docs.set('existing@test.com', {
      email: 'existing@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });
    const seeded = await bootstrapAdminIfEmpty('admin@test.com');
    expect(seeded).toBe(false);
    // Collection unchanged.
    expect(docs.has('admin@test.com')).toBe(false);
  });

  it('is idempotent — calling twice with same bootstrap email seeds once', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@test.com';
    const first = await bootstrapAdminIfEmpty('admin@test.com');
    expect(first).toBe(true);
    // Second call — collection now has one doc, so bootstrap path short-circuits.
    const second = await bootstrapAdminIfEmpty('admin@test.com');
    expect(second).toBe(false);
    expect(docs.size).toBe(1);
  });
});

describe('listAdmins', () => {
  it('returns empty array when collection empty', async () => {
    expect(await listAdmins()).toEqual([]);
  });

  it('returns all admins with shape {email, added_by, added_at}', async () => {
    docs.set('alice@test.com', {
      email: 'alice@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });
    docs.set('bob@test.com', {
      email: 'bob@test.com',
      added_by: 'alice@test.com',
      added_at: 2,
    });
    const out = await listAdmins();
    expect(out).toHaveLength(2);
    const emails = out.map((a) => a.email).sort();
    expect(emails).toEqual(['alice@test.com', 'bob@test.com']);
    const alice = out.find((a) => a.email === 'alice@test.com')!;
    expect(alice.added_by).toBe('bootstrap');
    expect(alice.added_at).toBe(1);
  });
});

describe('addAdmin', () => {
  it('writes the doc with lowercased email', async () => {
    await addAdmin('NewUser@Test.COM', 'admin@test.com');
    expect(docs.has('newuser@test.com')).toBe(true);
    const d = docs.get('newuser@test.com')!;
    expect(d.email).toBe('newuser@test.com');
    expect(d.added_by).toBe('admin@test.com');
    expect(typeof d.added_at).toBe('number');
  });

  it('throws on invalid email format', async () => {
    await expect(addAdmin('not-an-email', 'admin@test.com')).rejects.toThrow();
    await expect(addAdmin('', 'admin@test.com')).rejects.toThrow();
    await expect(addAdmin('foo@bar', 'admin@test.com')).rejects.toThrow();
    await expect(addAdmin('foo @bar.com', 'admin@test.com')).rejects.toThrow();
    expect(docs.size).toBe(0);
  });

  it('throws when the admin already exists', async () => {
    docs.set('taken@test.com', {
      email: 'taken@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });
    await expect(addAdmin('TAKEN@test.com', 'admin@test.com')).rejects.toThrow();
  });
});

describe('removeAdmin', () => {
  it('removes the doc by lowercased email', async () => {
    docs.set('bye@test.com', {
      email: 'bye@test.com',
      added_by: 'admin@test.com',
      added_at: 1,
    });
    await removeAdmin('BYE@Test.com');
    expect(docs.has('bye@test.com')).toBe(false);
  });

  it('is idempotent — no throw when doc does not exist', async () => {
    await expect(removeAdmin('missing@test.com')).resolves.toBeUndefined();
    expect(docs.size).toBe(0);
  });
});
