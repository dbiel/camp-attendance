/**
 * Integration-style test for `verifyAdmin` + admin allowlist helpers.
 *
 * Unlike `tests/unit/lib/auth.test.ts` — which mocks the allowlist helpers
 * directly — this suite runs the REAL `isAdminEmail` and
 * `bootstrapAdminIfEmpty` against an in-memory Firestore mock so we can
 * observe writes (or the lack thereof) when `verifyAdmin` is called.
 *
 * Regression: bootstrap-admin doc was never actually written because
 * `verifyAdmin` called `isAdminEmail` first (which returns true on the
 * bootstrap path without writing) and then short-circuited before reaching
 * `bootstrapAdminIfEmpty`. A subsequent `addAdmin` call made the collection
 * non-empty and stranded the bootstrap admin.
 *
 * This test catches that by verifying the admins collection contains the
 * caller's email AFTER a successful `verifyAdmin` call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Shared in-memory admins collection.
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

function makeAdminsCollection() {
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
    limit: (_n: number) => ({
      get: async () => ({
        empty: docs.size === 0,
        size: Math.min(docs.size, _n),
      }),
    }),
  };
}

const { verifyIdTokenMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    collection: (name: string) => {
      if (name === 'admins') return makeAdminsCollection();
      // config/camp etc. — verifyAdmin only touches `admins`.
      throw new Error(`unexpected collection in this test: ${name}`);
    },
  },
}));

import { verifyAdmin } from '@/lib/auth';
import { addAdmin, isAdminEmail } from '@/lib/firestore';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/test', { headers: new Headers(headers) });
}

beforeEach(() => {
  docs.clear();
  verifyIdTokenMock.mockReset();
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
});

describe('verifyAdmin — bootstrap seeding writes a doc', () => {
  it('regression: first bootstrap sign-in persists the admin doc', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'first@test.com';
    verifyIdTokenMock.mockResolvedValue({
      uid: 'uid-1',
      email: 'first@test.com',
    });

    // Collection is empty, so the caller is authorized via bootstrap.
    const decoded = await verifyAdmin(req({ Authorization: 'Bearer fake' }));
    expect(decoded).not.toBeNull();

    // CRUCIAL: the bootstrap admin's doc must now exist. Without the fix
    // isAdminEmail returns true via the bootstrap path and never writes.
    expect(docs.has('first@test.com')).toBe(true);

    // Simulate adding a second admin (as the POST /api/admins handler does).
    await addAdmin('second@test.com', 'first@test.com');

    // The collection now has both admins, not just the newly added one.
    expect(docs.has('first@test.com')).toBe(true);
    expect(docs.has('second@test.com')).toBe(true);

    // And a subsequent sign-in by the bootstrap admin still succeeds —
    // via the allowlist, not the now-invalid bootstrap path.
    expect(await isAdminEmail('first@test.com')).toBe(true);
  });

  it('bootstrap sign-in is case-insensitive and stores at lowercased key', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'mixed@test.com';
    verifyIdTokenMock.mockResolvedValue({
      uid: 'uid-mixed',
      email: 'Mixed@Test.Com',
    });

    const decoded = await verifyAdmin(req({ Authorization: 'Bearer fake' }));
    expect(decoded).not.toBeNull();
    expect(docs.has('mixed@test.com')).toBe(true);
  });

  it('non-bootstrap email on empty collection is rejected (and no doc written)', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'allowed@test.com';
    verifyIdTokenMock.mockResolvedValue({
      uid: 'uid-bad',
      email: 'mallory@test.com',
    });

    const decoded = await verifyAdmin(req({ Authorization: 'Bearer fake' }));
    expect(decoded).toBeNull();
    expect(docs.size).toBe(0);
  });

  it('bootstrap path is a no-op once the collection is non-empty', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'first@test.com';
    // Seed a different admin — collection is no longer empty.
    docs.set('already@test.com', {
      email: 'already@test.com',
      added_by: 'bootstrap',
      added_at: 1,
    });

    verifyIdTokenMock.mockResolvedValue({
      uid: 'uid-first',
      email: 'first@test.com',
    });

    // Even though first@test.com is in the bootstrap env, they're NOT
    // in the allowlist, and the collection is non-empty, so this must
    // fail. The bootstrap env is only for the literally-empty-collection
    // case.
    const decoded = await verifyAdmin(req({ Authorization: 'Bearer fake' }));
    expect(decoded).toBeNull();
    // Nothing got added either.
    expect(docs.has('first@test.com')).toBe(false);
  });
});
