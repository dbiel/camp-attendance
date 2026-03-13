/**
 * Import API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch } from '../../setup/api-client';

describe('Import API', () => {
  describe('POST /api/import/students', () => {
    it('admin can bulk import students', async () => {
      const { status, data } = await adminFetch('/api/import/students', {
        method: 'POST',
        body: {
          students: [
            {
              first_name: 'Import1',
              last_name: 'TestA',
              division: 'Residential',
              instrument: 'Flute',
              ensemble: 'Concert Band',
            },
            {
              first_name: 'Import2',
              last_name: 'TestB',
              division: 'Commuter',
              instrument: 'Clarinet',
              ensemble: 'Jazz Ensemble',
            },
          ],
        },
      });
      expect(status).toBe(201);
      expect(data.success).toBe(2);
      expect(data.failed).toBe(0);
    });

    it('rejects empty array', async () => {
      const { status } = await adminFetch('/api/import/students', {
        method: 'POST',
        body: { students: [] },
      });
      expect(status).toBe(400);
    });

    it('rejects invalid format', async () => {
      const { status } = await adminFetch('/api/import/students', {
        method: 'POST',
        body: { students: 'not-an-array' },
      });
      expect(status).toBe(400);
    });

    it('teacher cannot import', async () => {
      const { status } = await teacherFetch('/api/import/students', {
        method: 'POST',
        body: { students: [{ first_name: 'Test', last_name: 'User', instrument: 'Flute', ensemble: 'Band', division: 'Commuter' }] },
      });
      expect(status).toBe(403);
    });
  });

  describe('POST /api/import/faculty', () => {
    it('admin can bulk import faculty', async () => {
      const { status, data } = await adminFetch('/api/import/faculty', {
        method: 'POST',
        body: {
          faculty: [
            { first_name: 'ImportFac', last_name: 'Test', role: 'Instructor' },
          ],
        },
      });
      expect(status).toBe(201);
      expect(data.success).toBeGreaterThanOrEqual(1);
    });

    it('teacher cannot import faculty', async () => {
      const { status } = await teacherFetch('/api/import/faculty', {
        method: 'POST',
        body: { faculty: [{ first_name: 'Test', last_name: 'Fac', role: 'TA' }] },
      });
      expect(status).toBe(403);
    });
  });
});
