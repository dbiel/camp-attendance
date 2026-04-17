/**
 * Batch Attendance API Integration Tests
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { adminFetch, teacherFetch, publicFetch } from '../../setup/api-client';

describe('Batch Attendance API', () => {
  let sessionId: string;
  let studentIds: string[] = [];
  const testDate = '2026-06-09';

  beforeAll(async () => {
    const { data: sessions } = await adminFetch('/api/sessions');
    if (sessions?.length > 0) sessionId = sessions[0].id;

    const { data: students } = await adminFetch('/api/students');
    if (students?.length > 0) studentIds = students.map((s: { id: string }) => s.id);
  });

  describe('POST /api/attendance/batch', () => {
    it('returns 401 with no auth', async () => {
      const { status } = await publicFetch('/api/attendance/batch', {
        method: 'POST',
        body: { items: [] },
      });
      expect(status).toBe(401);
    });

    it('returns 400 on empty items', async () => {
      const { status } = await adminFetch('/api/attendance/batch', {
        method: 'POST',
        body: { items: [] },
      });
      expect(status).toBe(400);
    });

    it('returns 413 when items.length > 1000', async () => {
      if (!sessionId || !studentIds[0]) return;
      const items = Array.from({ length: 1001 }, () => ({
        student_id: studentIds[0],
        session_id: sessionId,
        date: testDate,
        status: 'present',
      }));
      const { status } = await adminFetch('/api/attendance/batch', {
        method: 'POST',
        body: { items },
      });
      expect(status).toBe(413);
    });

    it('admin can batch-mark attendance (happy path)', async () => {
      if (!sessionId || studentIds.length < 3) return;
      const items = studentIds.slice(0, 3).map(id => ({
        student_id: id,
        session_id: sessionId,
        date: testDate,
        status: 'present',
      }));
      const { status, data } = await adminFetch('/api/attendance/batch', {
        method: 'POST',
        body: { items },
      });
      expect(status).toBe(200);
      expect(data.written).toBe(3);
      expect(Array.isArray(data.errors)).toBe(true);
    });

    it('teacher can batch-mark attendance', async () => {
      if (!sessionId || studentIds.length < 2) return;
      const items = studentIds.slice(0, 2).map(id => ({
        student_id: id,
        session_id: sessionId,
        date: testDate,
        status: 'tardy',
      }));
      const { status, data } = await teacherFetch('/api/attendance/batch', {
        method: 'POST',
        body: { items },
      });
      expect(status).toBe(200);
      expect(data.written).toBe(2);
    });

    it('handles batch chunk boundary (>400 items)', async () => {
      if (!sessionId || !studentIds[0]) return;
      // Exercise the 400-op chunk boundary. Using the same student_id repeatedly
      // coalesces to a single doc (deterministic doc id), but the endpoint still
      // enqueues 450 writes to Firestore, which must be chunked across two batches.
      const items = Array.from({ length: 450 }, () => ({
        student_id: studentIds[0],
        session_id: sessionId,
        date: testDate,
        status: 'present',
      }));
      const { status, data } = await adminFetch('/api/attendance/batch', {
        method: 'POST',
        body: { items },
      });
      expect(status).toBe(200);
      expect(data.written).toBe(450);
    });
  });
});
