/**
 * Rollover API Integration Tests
 *
 * End-to-end against the Firebase emulator. This suite is destructive —
 * it seeds a dedicated subset of docs into attendance + session_students,
 * runs rollover, and asserts archive + clear + config update. It also
 * resets the camp config back to its original shape at the end so other
 * integration tests that run afterwards aren't poisoned.
 *
 * NOTE: the suite requires the Firestore + Auth emulators to be running
 * (and TEST_ADMIN_TOKEN set). When run outside `npm run test:integration`
 * the tests short-circuit at the top-level `beforeAll` guard and every
 * assertion is skipped rather than failing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminFetch } from '../../setup/api-client';

const HAS_EMULATOR =
  !!process.env.TEST_ADMIN_TOKEN &&
  !!process.env.FIRESTORE_EMULATOR_HOST;

// Skip the entire describe when the emulator isn't wired up so `npm test`
// (unit-only) never fails because of this file even if vitest picks it up
// by accident.
const maybeDescribe = HAS_EMULATOR ? describe : describe.skip;

// Admin SDK handle for direct DB seeding / inspection. Imported lazily so
// this file doesn't crash when firebase-admin credentials aren't present.
async function getDb() {
  const mod = await import('../../setup/emulator.setup');
  return mod.getTestDb();
}

maybeDescribe('POST /api/camps/rollover', () => {
  // Seed identifiers
  const NEW_YEAR = '2099';
  const NEW_START = '2099-06-07';
  const NEW_END = '2099-06-12';
  const NEW_TZ = 'America/Chicago';

  let originalConfig: Record<string, unknown> | null = null;
  let seededAttendanceIds: string[] = [];
  let seededSessionStudentIds: string[] = [];
  let oldId: string | null = null;

  beforeAll(async () => {
    if (!HAS_EMULATOR) return;
    const db = await getDb();

    // Capture and bootstrap a full config/camp so loadActiveCampServer
    // doesn't throw on missing fields. Preserve whatever else was seeded
    // so we can restore it in afterAll.
    const cfgSnap = await db.collection('config').doc('camp').get();
    originalConfig = cfgSnap.exists ? (cfgSnap.data() as Record<string, unknown>) : null;

    const baseConfig = {
      camp_id: '2026',
      camp_year: 2026,
      camp_code: 'ROLLTST2',
      start_date: '2026-06-08',
      end_date: '2026-06-12',
      timezone: 'America/Chicago',
      day_dates: {
        M: '2026-06-08',
        T: '2026-06-09',
        W: '2026-06-10',
        Th: '2026-06-11',
        F: '2026-06-12',
      },
    };
    await db.collection('config').doc('camp').set(baseConfig);
    oldId = baseConfig.camp_id;

    // Seed 10 attendance docs and 5 session_students docs with predictable
    // ids so we can assert the archive content later.
    seededAttendanceIds = Array.from({ length: 10 }, (_, i) => `rollover-test-att-${i}`);
    seededSessionStudentIds = Array.from({ length: 5 }, (_, i) => `rollover-test-ss-${i}`);

    const batch = db.batch();
    for (const id of seededAttendanceIds) {
      batch.set(db.collection('attendance').doc(id), {
        student_id: `stu-${id}`,
        session_id: `sess-${id}`,
        date: '2026-06-08',
        status: 'present',
        marked_at: new Date().toISOString(),
        marked_by: 'rollover-test',
        first_name: 'Test',
        last_name: 'Student',
        last_initial: 'S',
        preferred_name: null,
        instrument: 'Flute',
        ensemble: 'Concert Band',
        session_name: 'Rollover Test Session',
        period_number: 1,
        period_name: 'Period 1',
        teacher_name: 'Rollover Tester',
      });
    }
    for (const id of seededSessionStudentIds) {
      batch.set(db.collection('session_students').doc(id), {
        session_id: `sess-${id}`,
        student_id: `stu-${id}`,
        first_name: 'Test',
        last_initial: 'S',
        preferred_name: null,
        instrument: 'Flute',
        ensemble: 'Concert Band',
        dorm_room: '101',
      });
    }
    await batch.commit();
  });

  afterAll(async () => {
    if (!HAS_EMULATOR) return;
    const db = await getDb();

    // Best-effort cleanup of any archive docs we created so downstream
    // test runs don't inherit them.
    if (oldId) {
      const archAtt = await db.collection(`camps/${oldId}/attendance`).listDocuments();
      const archSs = await db.collection(`camps/${oldId}/session_students`).listDocuments();
      for (const ref of [...archAtt, ...archSs]) {
        try {
          await ref.delete();
        } catch {
          // ignore
        }
      }
    }

    // Restore the original camp config if there was one so the rest of
    // the integration suite still finds a sensible config/camp doc.
    if (originalConfig) {
      await db.collection('config').doc('camp').set(originalConfig);
    }
  });

  it('dry_run returns archive counts without writing', async () => {
    const { status, data } = await adminFetch('/api/camps/rollover', {
      method: 'POST',
      body: {
        new_year: NEW_YEAR,
        new_start_date: NEW_START,
        new_end_date: NEW_END,
        new_timezone: NEW_TZ,
        dry_run: true,
      },
    });
    expect(status).toBe(200);
    expect(data.dry_run).toBe(true);
    expect(data.old_id).toBe(oldId);
    expect(data.new_id).toBe(NEW_YEAR);
    expect(data.new_camp_code).toBe('');
    expect(data.archived.attendance).toBeGreaterThanOrEqual(10);
    expect(data.archived.session_students).toBeGreaterThanOrEqual(5);
    expect(data.cleared.attendance).toBe(0);
    expect(data.cleared.session_students).toBe(0);

    // Nothing should have been written.
    const db = await getDb();
    const liveAttSnap = await db.collection('attendance').get();
    expect(liveAttSnap.size).toBeGreaterThanOrEqual(10);
    const cfgSnap = await db.collection('config').doc('camp').get();
    expect(cfgSnap.data()?.camp_id).toBe(oldId);
  });

  it('full run archives, clears live, and advances config', async () => {
    const { status, data } = await adminFetch('/api/camps/rollover', {
      method: 'POST',
      body: {
        new_year: NEW_YEAR,
        new_start_date: NEW_START,
        new_end_date: NEW_END,
        new_timezone: NEW_TZ,
        clear_ensemble_assignments: false,
      },
    });
    expect(status).toBe(200);
    expect(data.dry_run).toBe(false);
    expect(data.old_id).toBe(oldId);
    expect(data.new_id).toBe(NEW_YEAR);
    expect(typeof data.new_camp_code).toBe('string');
    expect(data.new_camp_code).toHaveLength(8);
    expect(data.new_camp_code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(data.archived.attendance).toBeGreaterThanOrEqual(10);
    expect(data.archived.session_students).toBeGreaterThanOrEqual(5);
    expect(data.cleared.attendance).toBe(data.archived.attendance);
    expect(data.cleared.session_students).toBe(data.archived.session_students);

    const db = await getDb();

    // Archive should contain every seeded doc.
    for (const id of seededAttendanceIds) {
      const doc = await db.collection(`camps/${oldId}/attendance`).doc(id).get();
      expect(doc.exists).toBe(true);
    }
    for (const id of seededSessionStudentIds) {
      const doc = await db.collection(`camps/${oldId}/session_students`).doc(id).get();
      expect(doc.exists).toBe(true);
    }

    // Live collections must be empty.
    const liveAtt = await db.collection('attendance').get();
    expect(liveAtt.size).toBe(0);
    const liveSs = await db.collection('session_students').get();
    expect(liveSs.size).toBe(0);

    // Config advanced.
    const cfg = (await db.collection('config').doc('camp').get()).data();
    expect(cfg?.camp_id).toBe(NEW_YEAR);
    expect(cfg?.camp_year).toBe(Number.parseInt(NEW_YEAR, 10));
    expect(cfg?.start_date).toBe(NEW_START);
    expect(cfg?.end_date).toBe(NEW_END);
    expect(cfg?.timezone).toBe(NEW_TZ);
    expect(cfg?.camp_code).toBe(data.new_camp_code);
    expect(cfg?.day_dates).toBeDefined();
  });

  it('rejects a second rollover with new_year <= current year (400)', async () => {
    // After the previous test camp_year is NEW_YEAR (2099). Anything <=
    // 2099 should 400.
    const { status } = await adminFetch('/api/camps/rollover', {
      method: 'POST',
      body: {
        new_year: NEW_YEAR, // same year = reject
        new_start_date: NEW_START,
        new_end_date: NEW_END,
        new_timezone: NEW_TZ,
        dry_run: true,
      },
    });
    expect(status).toBe(400);
  });

  it('re-running archive against existing archive is idempotent (same doc ids)', async () => {
    // Reset camp config back to 2026 so we can run rollover once more
    // against the same oldId and verify idempotency of the archive copy.
    const db = await getDb();
    await db.collection('config').doc('camp').update({
      camp_id: '2026',
      camp_year: 2026,
      start_date: '2026-06-08',
      end_date: '2026-06-12',
      timezone: 'America/Chicago',
      day_dates: {
        M: '2026-06-08',
        T: '2026-06-09',
        W: '2026-06-10',
        Th: '2026-06-11',
        F: '2026-06-12',
      },
    });

    // Seed one more attendance doc with an id that already exists in the
    // 2026 archive. Re-running rollover should NOT duplicate — same doc id.
    const replayId = seededAttendanceIds[0]!;
    await db.collection('attendance').doc(replayId).set({
      student_id: 'replay',
      session_id: 'replay',
      date: '2026-06-08',
      status: 'tardy',
      marked_at: new Date().toISOString(),
      marked_by: 'replay',
      first_name: 'Replay',
      last_name: 'Student',
      last_initial: 'S',
      preferred_name: null,
      instrument: 'Flute',
      ensemble: 'Concert Band',
      session_name: 'Replay',
      period_number: 1,
      period_name: 'Period 1',
      teacher_name: 'Replay',
    });

    const { status, data } = await adminFetch('/api/camps/rollover', {
      method: 'POST',
      body: {
        new_year: '2100',
        new_start_date: '2100-06-07',
        new_end_date: '2100-06-12',
        new_timezone: NEW_TZ,
      },
    });
    expect(status).toBe(200);

    // Archive for the 2026 camp now holds exactly one doc under replayId —
    // the copy overwrote, no duplicate doc created.
    const archDocs = await db.collection(`camps/${oldId}/attendance`).listDocuments();
    const idsInArchive = archDocs.map((r) => r.id);
    expect(idsInArchive).toContain(replayId);
    expect(idsInArchive.filter((id) => id === replayId).length).toBe(1);

    // Sanity: the overall rollover still reports the live count it saw.
    expect(data.archived.attendance).toBeGreaterThanOrEqual(1);
  });
});
