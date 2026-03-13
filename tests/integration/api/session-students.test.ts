/**
 * Session Students API Integration Tests
 *
 * This endpoint is the PII sanitization boundary:
 * - Teachers see denormalized non-PII data
 * - Admins see full Student records
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { adminFetch, teacherFetch } from '../../setup/api-client';
import { PII_FIELDS } from '../../setup/test-data';

describe('Session Students API', () => {
  let sessionId: string;

  beforeAll(async () => {
    const { data: sessions } = await adminFetch('/api/sessions');
    if (sessions?.length > 0) sessionId = sessions[0].id;
  });

  describe('GET /api/sessions/[id]/students', () => {
    it('teacher sees only safe fields', async () => {
      if (!sessionId) return;
      const { status, data } = await teacherFetch(`/api/sessions/${sessionId}/students`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      for (const s of data) {
        // Must have safe fields
        expect(s).toHaveProperty('first_name');
        expect(s).toHaveProperty('last_initial');
        expect(s).toHaveProperty('instrument');
        expect(s).toHaveProperty('ensemble');
        expect(s).toHaveProperty('session_id');
        expect(s).toHaveProperty('student_id');

        // Must NOT have PII
        for (const field of PII_FIELDS) {
          expect(s).not.toHaveProperty(field);
        }
      }
    });

    it('admin sees full student records', async () => {
      if (!sessionId) return;
      const { status, data } = await adminFetch(`/api/sessions/${sessionId}/students`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        // Admin gets full Student objects
        expect(data[0]).toHaveProperty('first_name');
        expect(data[0]).toHaveProperty('last_name');
        expect(data[0]).toHaveProperty('instrument');
      }
    });

    it('admin response sorted by last_name then first_name', async () => {
      if (!sessionId) return;
      const { data } = await adminFetch(`/api/sessions/${sessionId}/students`);
      if (data.length < 2) return;
      for (let i = 1; i < data.length; i++) {
        const cmp = data[i - 1].last_name.localeCompare(data[i].last_name);
        if (cmp === 0) {
          expect(data[i - 1].first_name.localeCompare(data[i].first_name)).toBeLessThanOrEqual(0);
        } else {
          expect(cmp).toBeLessThanOrEqual(0);
        }
      }
    });
  });
});
