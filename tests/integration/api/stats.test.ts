/**
 * Stats API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch } from '../../setup/api-client';

describe('Stats API', () => {
  const testDate = '2026-06-08';

  describe('GET /api/stats', () => {
    it('admin can get daily stats', async () => {
      const { status, data } = await adminFetch(`/api/stats?date=${testDate}`);
      expect(status).toBe(200);
      expect(data).toHaveProperty('date', testDate);
      expect(data).toHaveProperty('present');
      expect(data).toHaveProperty('absent');
      expect(data).toHaveProperty('tardy');
      expect(data).toHaveProperty('unmarked');
      expect(data).toHaveProperty('total');
      expect(typeof data.present).toBe('number');
      expect(typeof data.total).toBe('number');
    });

    it('teacher cannot access stats', async () => {
      const { status } = await teacherFetch(`/api/stats?date=${testDate}`);
      expect(status).toBe(403);
    });

    it('counts sum to total', async () => {
      const { data } = await adminFetch(`/api/stats?date=${testDate}`);
      expect(data.present + data.absent + data.tardy + data.unmarked).toBe(data.total);
    });
  });
});
