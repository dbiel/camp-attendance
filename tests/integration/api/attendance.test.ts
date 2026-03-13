/**
 * Attendance API Integration Tests
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { adminFetch, teacherFetch } from '../../setup/api-client';

describe('Attendance API', () => {
  let sessionId: string;
  let studentId: string;
  const testDate = '2026-06-08';

  beforeAll(async () => {
    const { data: sessions } = await adminFetch('/api/sessions');
    if (sessions?.length > 0) sessionId = sessions[0].id;

    const { data: students } = await adminFetch('/api/students');
    if (students?.length > 0) studentId = students[0].id;
  });

  describe('POST /api/attendance', () => {
    it('admin can mark attendance', async () => {
      if (!sessionId || !studentId) return;
      const { status, data } = await adminFetch('/api/attendance', {
        method: 'POST',
        body: {
          student_id: studentId,
          session_id: sessionId,
          date: testDate,
          status: 'present',
          marked_by: 'admin-test',
        },
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('teacher can mark attendance', async () => {
      if (!sessionId || !studentId) return;
      const { status, data } = await teacherFetch('/api/attendance', {
        method: 'POST',
        body: {
          student_id: studentId,
          session_id: sessionId,
          date: testDate,
          status: 'tardy',
          marked_by: 'teacher-test',
        },
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('rejects missing required fields', async () => {
      const { status } = await adminFetch('/api/attendance', {
        method: 'POST',
        body: { student_id: studentId },
      });
      expect(status).toBe(400);
    });
  });

  describe('GET /api/attendance', () => {
    it('returns session attendance for given date', async () => {
      if (!sessionId) return;
      const { status, data } = await adminFetch(
        `/api/attendance?session_id=${sessionId}&date=${testDate}`
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('rejects missing parameters', async () => {
      const { status } = await adminFetch('/api/attendance');
      expect(status).toBe(400);
    });

    it('teacher gets sanitized attendance (no PII)', async () => {
      if (!sessionId) return;
      const { status, data } = await teacherFetch(
        `/api/attendance?session_id=${sessionId}&date=${testDate}`
      );
      expect(status).toBe(200);
      for (const record of data) {
        expect(record).not.toHaveProperty('last_name');
        expect(record).not.toHaveProperty('email');
        expect(record).not.toHaveProperty('cell_phone');
        expect(record).not.toHaveProperty('parent_phone');
        expect(record).not.toHaveProperty('medical_notes');
      }
    });
  });
});
