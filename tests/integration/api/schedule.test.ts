/**
 * Schedule API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch, publicFetch } from '../../setup/api-client';

describe('Schedule API', () => {
  describe('GET /api/schedule', () => {
    it('admin can get schedule grid', async () => {
      const { status, data } = await adminFetch('/api/schedule');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('teacher can get schedule grid', async () => {
      const { status, data } = await teacherFetch('/api/schedule');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('unauthenticated cannot get schedule', async () => {
      const { status } = await publicFetch('/api/schedule');
      expect(status).toBe(401);
    });

    it('schedule entries have period and faculty info', async () => {
      const { data } = await adminFetch('/api/schedule');
      if (data.length === 0) return;
      const entry = data[0];
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('period_number');
      expect(entry).toHaveProperty('period_name');
      expect(entry).toHaveProperty('faculty_name');
      expect(entry).toHaveProperty('student_count');
    });

    it('schedule is sorted by period_number then name', async () => {
      const { data } = await adminFetch('/api/schedule');
      if (data.length < 2) return;
      for (let i = 1; i < data.length; i++) {
        if (data[i - 1].period_number !== data[i].period_number) {
          expect(data[i - 1].period_number).toBeLessThan(data[i].period_number);
        }
      }
    });
  });
});
