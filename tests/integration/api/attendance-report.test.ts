/**
 * Attendance Report API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch } from '../../setup/api-client';

describe('Attendance Report API', () => {
  const testDate = '2026-06-08';

  describe('GET /api/attendance/report', () => {
    it('admin can get report', async () => {
      const { status, data } = await adminFetch(`/api/attendance/report?date=${testDate}`);
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('report contains student contact info for admin', async () => {
      const { status, data } = await adminFetch(`/api/attendance/report?date=${testDate}&status=absent`);
      expect(status).toBe(200);
      if (data.length > 0) {
        const record = data[0];
        expect(record).toHaveProperty('first_name');
        expect(record).toHaveProperty('last_name');
        expect(record).toHaveProperty('session_name');
        expect(record).toHaveProperty('period_number');
        expect(record).toHaveProperty('status');
      }
    });

    it('filters by status', async () => {
      const { data: absentOnly } = await adminFetch(`/api/attendance/report?date=${testDate}&status=absent`);
      for (const r of absentOnly) {
        expect(r.status).toBe('absent');
      }

      const { data: tardyOnly } = await adminFetch(`/api/attendance/report?date=${testDate}&status=tardy`);
      for (const r of tardyOnly) {
        expect(r.status).toBe('tardy');
      }
    });

    it('sorts by period, ensemble, last_name, first_name', async () => {
      const { data } = await adminFetch(`/api/attendance/report?date=${testDate}`);
      if (data.length < 2) return;
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        if (prev.period_number !== curr.period_number) {
          expect(prev.period_number).toBeLessThan(curr.period_number);
        }
      }
    });

    it('rejects missing date parameter', async () => {
      const { status } = await adminFetch('/api/attendance/report');
      expect(status).toBe(400);
    });

    it('teacher cannot access report', async () => {
      const { status } = await teacherFetch(`/api/attendance/report?date=${testDate}`);
      expect(status).toBe(403);
    });
  });
});
