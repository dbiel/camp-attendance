/**
 * Role Escalation Tests
 *
 * Verifies that teacher-role requests cannot access admin-only endpoints.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { teacherFetch, adminFetch } from '../setup/api-client';
import { makeStudent, makeFaculty, makeSession } from '../setup/test-data';

describe('Role Escalation Prevention', () => {
  let studentId: string;
  let facultyId: string;
  let sessionId: string;
  const testDate = '2026-06-08';

  beforeAll(async () => {
    // Get existing IDs for testing
    const { data: students } = await adminFetch('/api/students');
    if (students?.length > 0) studentId = students[0].id;

    const { data: faculty } = await adminFetch('/api/faculty');
    if (faculty?.length > 0) facultyId = faculty[0].id;

    const { data: sessions } = await adminFetch('/api/sessions');
    if (sessions?.length > 0) sessionId = sessions[0].id;
  });

  describe('Teacher cannot perform Student CRUD', () => {
    it('GET /api/students → 403', async () => {
      const { status } = await teacherFetch('/api/students');
      expect(status).toBe(403);
    });

    it('POST /api/students → 403', async () => {
      const { status } = await teacherFetch('/api/students', {
        method: 'POST',
        body: makeStudent(),
      });
      expect(status).toBe(403);
    });

    it('GET /api/students/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/students/${studentId}`);
      expect(status).toBe(403);
    });

    it('PUT /api/students/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/students/${studentId}`, {
        method: 'PUT',
        body: { first_name: 'Hacked' },
      });
      expect(status).toBe(403);
    });

    it('DELETE /api/students/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/students/${studentId}`, {
        method: 'DELETE',
      });
      expect(status).toBe(403);
    });

    it('GET /api/students/[id]/schedule → 403', async () => {
      const { status } = await teacherFetch(`/api/students/${studentId}/schedule`);
      expect(status).toBe(403);
    });
  });

  describe('Teacher cannot access admin-only reports', () => {
    it('GET /api/attendance/report → 403', async () => {
      const { status } = await teacherFetch(`/api/attendance/report?date=${testDate}`);
      expect(status).toBe(403);
    });

    it('GET /api/stats → 403', async () => {
      const { status } = await teacherFetch(`/api/stats?date=${testDate}`);
      expect(status).toBe(403);
    });
  });

  describe('Teacher cannot use import endpoints', () => {
    it('POST /api/import/students → 403', async () => {
      const { status } = await teacherFetch('/api/import/students', {
        method: 'POST',
        body: { students: [makeStudent()] },
      });
      expect(status).toBe(403);
    });

    it('POST /api/import/faculty → 403', async () => {
      const { status } = await teacherFetch('/api/import/faculty', {
        method: 'POST',
        body: { faculty: [makeFaculty()] },
      });
      expect(status).toBe(403);
    });

    it('POST /api/import/sessions → 403', async () => {
      const { status } = await teacherFetch('/api/import/sessions', {
        method: 'POST',
        body: { sessions: [makeSession()] },
      });
      expect(status).toBe(403);
    });

    it('POST /api/import/enrollments → 403', async () => {
      const { status } = await teacherFetch('/api/import/enrollments', {
        method: 'POST',
        body: { enrollments: [{ session_id: sessionId, student_id: studentId }] },
      });
      expect(status).toBe(403);
    });
  });

  describe('Teacher cannot create/update/delete faculty', () => {
    it('POST /api/faculty → 403', async () => {
      const { status } = await teacherFetch('/api/faculty', {
        method: 'POST',
        body: makeFaculty(),
      });
      expect(status).toBe(403);
    });

    it('PUT /api/faculty/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/faculty/${facultyId}`, {
        method: 'PUT',
        body: { first_name: 'Hacked' },
      });
      expect(status).toBe(403);
    });

    it('DELETE /api/faculty/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/faculty/${facultyId}`, {
        method: 'DELETE',
      });
      expect(status).toBe(403);
    });
  });

  describe('Teacher cannot create/update/delete sessions', () => {
    it('POST /api/sessions → 403', async () => {
      const { status } = await teacherFetch('/api/sessions', {
        method: 'POST',
        body: makeSession(),
      });
      expect(status).toBe(403);
    });

    it('PUT /api/sessions/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        body: { name: 'Hacked Session' },
      });
      expect(status).toBe(403);
    });

    it('DELETE /api/sessions/[id] → 403', async () => {
      const { status } = await teacherFetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      expect(status).toBe(403);
    });
  });
});
