/**
 * Faculty API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, publicFetch, teacherFetch } from '../../setup/api-client';
import { makeFaculty } from '../../setup/test-data';

describe('Faculty API', () => {
  let createdId: string;

  describe('GET /api/faculty', () => {
    it('returns faculty list (public, no auth needed)', async () => {
      const { status, data } = await publicFetch('/api/faculty');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns sorted by last_name then first_name', async () => {
      const { data } = await publicFetch('/api/faculty');
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

  describe('POST /api/faculty', () => {
    it('admin can create faculty', async () => {
      const faculty = makeFaculty({ first_name: 'Test', last_name: 'Faculty' });
      const { status, data } = await adminFetch('/api/faculty', {
        method: 'POST',
        body: faculty,
      });
      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      createdId = data.id;
    });

    it('teacher cannot create faculty', async () => {
      const { status } = await teacherFetch('/api/faculty', {
        method: 'POST',
        body: makeFaculty(),
      });
      expect(status).toBe(403);
    });
  });

  describe('GET /api/faculty/[id]', () => {
    it('returns single faculty (public)', async () => {
      const { data: list } = await publicFetch('/api/faculty');
      if (list.length === 0) return;
      const { status, data } = await publicFetch(`/api/faculty/${list[0].id}`);
      expect(status).toBe(200);
      expect(data.first_name).toBeDefined();
      expect(data.last_name).toBeDefined();
    });

    it('returns 404 for nonexistent', async () => {
      const { status } = await publicFetch('/api/faculty/nonexistent-id');
      expect(status).toBe(404);
    });
  });

  describe('PUT /api/faculty/[id]', () => {
    it('admin can update faculty', async () => {
      if (!createdId) return;
      const { status, data } = await adminFetch(`/api/faculty/${createdId}`, {
        method: 'PUT',
        body: { role: 'Updated Role' },
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('DELETE /api/faculty/[id]', () => {
    it('admin can delete faculty', async () => {
      if (!createdId) return;
      const { status, data } = await adminFetch(`/api/faculty/${createdId}`, {
        method: 'DELETE',
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
