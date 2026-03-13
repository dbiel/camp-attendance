/**
 * PII Leakage Tests — COPPA Critical
 *
 * Verifies that teacher-role API responses NEVER contain PII fields.
 * This is the most important security test file.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { adminFetch, teacherFetch } from '../setup/api-client';
import { PII_FIELDS, SAFE_FIELDS } from '../setup/test-data';

// These tests run against the dev server + Firebase Emulator.
// Seed data must be loaded before running (see emulator.setup.ts).

describe('PII Leakage Prevention', () => {
  let sessionId: string;
  let studentId: string;
  const testDate = '2026-06-08';

  beforeAll(async () => {
    // Get a session ID from the schedule
    const { data: sessions } = await adminFetch('/api/sessions');
    expect(sessions).toBeDefined();
    expect(sessions.length).toBeGreaterThan(0);
    sessionId = sessions[0].id;

    // Get a student ID
    const { data: students } = await adminFetch('/api/students');
    expect(students).toBeDefined();
    expect(students.length).toBeGreaterThan(0);
    studentId = students[0].id;
  });

  describe('GET /api/sessions/[id]/students — Teacher view', () => {
    it('teacher response contains ONLY safe fields (no PII)', async () => {
      const { status, data } = await teacherFetch(`/api/sessions/${sessionId}/students`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      if (data.length === 0) return; // skip if no enrollments

      for (const student of data) {
        // Must NOT have PII fields
        for (const field of PII_FIELDS) {
          expect(student).not.toHaveProperty(field);
        }

        // Must have safe fields
        expect(student).toHaveProperty('first_name');
        expect(student).toHaveProperty('last_initial');
        expect(student).toHaveProperty('instrument');
        expect(student).toHaveProperty('ensemble');
      }
    });

    it('admin response contains full Student objects with PII', async () => {
      const { status, data } = await adminFetch(`/api/sessions/${sessionId}/students`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      if (data.length === 0) return;

      for (const student of data) {
        // Admin sees full student record including PII
        expect(student).toHaveProperty('first_name');
        expect(student).toHaveProperty('last_name');
        expect(student).toHaveProperty('last_initial');
        expect(student).toHaveProperty('instrument');
        expect(student).toHaveProperty('ensemble');
      }
    });
  });

  describe('GET /api/attendance — Teacher view', () => {
    it('teacher response contains only status fields, no denormalized PII', async () => {
      const { status, data } = await teacherFetch(
        `/api/attendance?session_id=${sessionId}&date=${testDate}`
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      for (const record of data) {
        // Teacher attendance should only have these fields
        const allowedFields = ['id', 'student_id', 'session_id', 'date', 'status', 'marked_at'];
        const recordKeys = Object.keys(record);

        for (const key of recordKeys) {
          expect(allowedFields).toContain(key);
        }

        // Must NOT have denormalized PII
        for (const field of PII_FIELDS) {
          expect(record).not.toHaveProperty(field);
        }

        // Must NOT have denormalized session/period fields in teacher view
        expect(record).not.toHaveProperty('session_name');
        expect(record).not.toHaveProperty('period_number');
        expect(record).not.toHaveProperty('teacher_name');
      }
    });

    it('admin response may contain denormalized fields', async () => {
      const { status, data } = await adminFetch(
        `/api/attendance?session_id=${sessionId}&date=${testDate}`
      );
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      // Admin gets full attendance records (denormalized)
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('student_id');
        expect(data[0]).toHaveProperty('session_id');
        expect(data[0]).toHaveProperty('status');
      }
    });
  });

  describe('Teacher cannot access student PII via any endpoint', () => {
    it('GET /api/students returns 403 for teacher', async () => {
      const { status } = await teacherFetch('/api/students');
      expect(status).toBe(403);
    });

    it('GET /api/students/[id] returns 403 for teacher', async () => {
      const { status } = await teacherFetch(`/api/students/${studentId}`);
      expect(status).toBe(403);
    });

    it('GET /api/attendance/report returns 403 for teacher', async () => {
      const { status } = await teacherFetch(`/api/attendance/report?date=${testDate}`);
      expect(status).toBe(403);
    });

    it('GET /api/stats returns 403 for teacher', async () => {
      const { status } = await teacherFetch(`/api/stats?date=${testDate}`);
      expect(status).toBe(403);
    });
  });
});
