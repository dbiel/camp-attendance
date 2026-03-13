/**
 * Auth Bypass Tests
 *
 * Verifies that unauthenticated requests and invalid credentials
 * are properly rejected.
 */
import { describe, it, expect } from 'vitest';
import { publicFetch, invalidTokenFetch, invalidCampCodeFetch } from '../setup/api-client';

describe('Auth Bypass Prevention', () => {
  const testDate = '2026-06-08';

  describe('No auth headers on protected endpoints → 401/403', () => {
    it('GET /api/students → 403 (admin-only)', async () => {
      const { status } = await publicFetch('/api/students');
      expect(status).toBe(403);
    });

    it('POST /api/students → 403 (admin-only)', async () => {
      const { status } = await publicFetch('/api/students', {
        method: 'POST',
        body: { first_name: 'Test', last_name: 'User', division: 'Commuter', instrument: 'Flute', ensemble: 'Band' },
      });
      expect(status).toBe(403);
    });

    it('GET /api/sessions → 401 (auth-required)', async () => {
      const { status } = await publicFetch('/api/sessions');
      expect(status).toBe(401);
    });

    it('GET /api/attendance → 401 (auth-required)', async () => {
      const { status } = await publicFetch(`/api/attendance?session_id=x&date=${testDate}`);
      expect(status).toBe(401);
    });

    it('POST /api/attendance → 401 (auth-required)', async () => {
      const { status } = await publicFetch('/api/attendance', {
        method: 'POST',
        body: { student_id: 'x', session_id: 'x', date: testDate, status: 'present' },
      });
      expect(status).toBe(401);
    });

    it('GET /api/attendance/report → 403 (admin-only)', async () => {
      const { status } = await publicFetch(`/api/attendance/report?date=${testDate}`);
      expect(status).toBe(403);
    });

    it('GET /api/stats → 403 (admin-only)', async () => {
      const { status } = await publicFetch(`/api/stats?date=${testDate}`);
      expect(status).toBe(403);
    });

    it('GET /api/schedule → 401 (auth-required)', async () => {
      const { status } = await publicFetch('/api/schedule');
      expect(status).toBe(401);
    });

    it('POST /api/import/students → 403 (admin-only)', async () => {
      const { status } = await publicFetch('/api/import/students', {
        method: 'POST',
        body: { students: [] },
      });
      expect(status).toBe(403);
    });
  });

  describe('Invalid Bearer token → 403', () => {
    it('GET /api/students with garbage token → 403', async () => {
      const { status } = await invalidTokenFetch('/api/students');
      expect(status).toBe(403);
    });

    it('GET /api/attendance/report with garbage token → 403', async () => {
      const { status } = await invalidTokenFetch(`/api/attendance/report?date=${testDate}`);
      expect(status).toBe(403);
    });

    it('POST /api/import/students with garbage token → 403', async () => {
      const { status } = await invalidTokenFetch('/api/import/students', {
        method: 'POST',
        body: { students: [] },
      });
      expect(status).toBe(403);
    });
  });

  describe('Invalid camp code → 401', () => {
    it('GET /api/sessions with wrong camp code → 401', async () => {
      const { status } = await invalidCampCodeFetch('/api/sessions');
      expect(status).toBe(401);
    });

    it('GET /api/attendance with wrong camp code → 401', async () => {
      const { status } = await invalidCampCodeFetch(`/api/attendance?session_id=x&date=${testDate}`);
      expect(status).toBe(401);
    });

    it('POST /api/attendance with wrong camp code → 401', async () => {
      const { status } = await invalidCampCodeFetch('/api/attendance', {
        method: 'POST',
        body: { student_id: 'x', session_id: 'x', date: testDate, status: 'present' },
      });
      expect(status).toBe(401);
    });
  });

  describe('Public endpoints remain accessible without auth', () => {
    it('GET /api/faculty → 200 (public)', async () => {
      const { status } = await publicFetch('/api/faculty');
      expect(status).toBe(200);
    });

    it('GET /api/faculty/[id] → 200 or 404 (public)', async () => {
      const { status } = await publicFetch('/api/faculty/nonexistent-id');
      expect([200, 404]).toContain(status);
    });
  });
});
