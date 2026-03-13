/**
 * Firestore Security Rules Tests
 *
 * Tests Firestore rules directly using @firebase/rules-unit-testing.
 * Verifies that client-side SDK access is properly restricted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('Firestore Security Rules', () => {
  describe('Unauthenticated access', () => {
    it('cannot read students', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection('students').get());
    });

    it('cannot read attendance', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection('attendance').get());
    });

    it('cannot read config', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.doc('config/camp').get());
    });

    it('CAN read faculty', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(db.collection('faculty').get());
    });

    it('CAN read sessions', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(db.collection('sessions').get());
    });

    it('CAN read periods', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(db.collection('periods').get());
    });

    it('CAN read session_students', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(db.collection('session_students').get());
    });
  });

  describe('Authenticated access', () => {
    it('CAN read attendance', async () => {
      const db = testEnv.authenticatedContext('admin-uid').firestore();
      await assertSucceeds(db.collection('attendance').get());
    });

    it('cannot read students (server-side only)', async () => {
      const db = testEnv.authenticatedContext('admin-uid').firestore();
      await assertFails(db.collection('students').get());
    });

    it('cannot read config (server-side only)', async () => {
      const db = testEnv.authenticatedContext('admin-uid').firestore();
      await assertFails(db.doc('config/camp').get());
    });
  });

  describe('No client can write to any collection', () => {
    const collections = ['students', 'faculty', 'periods', 'sessions', 'session_students', 'attendance'];

    for (const col of collections) {
      it(`unauthenticated cannot write to ${col}`, async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(db.collection(col).add({ test: true }));
      });

      it(`authenticated cannot write to ${col}`, async () => {
        const db = testEnv.authenticatedContext('admin-uid').firestore();
        await assertFails(db.collection(col).add({ test: true }));
      });
    }

    it('unauthenticated cannot write to config', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.doc('config/camp').set({ camp_code: 'hacked' }));
    });

    it('authenticated cannot write to config', async () => {
      const db = testEnv.authenticatedContext('admin-uid').firestore();
      await assertFails(db.doc('config/camp').set({ camp_code: 'hacked' }));
    });
  });
});
