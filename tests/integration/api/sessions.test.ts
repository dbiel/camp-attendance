/**
 * Sessions API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch, publicFetch } from '../../setup/api-client';
import { makeSession } from '../../setup/test-data';

describe('Sessions API', () => {
  let createdId: string;
  let periodId: string;

  describe('GET /api/sessions', () => {
    it('admin can list sessions', async () => {
      const { status, data } = await adminFetch('/api/sessions');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        periodId = data[0].period_id;
      }
    });

    it('teacher can list sessions', async () => {
      const { status, data } = await teacherFetch('/api/sessions');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('unauthenticated cannot list sessions', async () => {
      const { status } = await publicFetch('/api/sessions');
      expect(status).toBe(401);
    });
  });

  describe('POST /api/sessions', () => {
    it('admin can create session', async () => {
      if (!periodId) return;
      const session = makeSession({ name: 'Test Session', period_id: periodId });
      const { status, data } = await adminFetch('/api/sessions', {
        method: 'POST',
        body: session,
      });
      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      createdId = data.id;
    });

    it('teacher cannot create session', async () => {
      const { status } = await teacherFetch('/api/sessions', {
        method: 'POST',
        body: makeSession(),
      });
      expect(status).toBe(403);
    });
  });

  describe('GET /api/sessions/[id]', () => {
    it('returns session with period info', async () => {
      if (!createdId) return;
      const { status, data } = await adminFetch(`/api/sessions/${createdId}`);
      expect(status).toBe(200);
      expect(data.name).toBe('Test Session');
      expect(data.period_number).toBeDefined();
      expect(data.start_time).toBeDefined();
      expect(data.end_time).toBeDefined();
    });

    it('returns 404 for nonexistent', async () => {
      const { status } = await adminFetch('/api/sessions/nonexistent-id');
      expect(status).toBe(404);
    });
  });

  describe('PUT /api/sessions/[id]', () => {
    it('admin can update session', async () => {
      if (!createdId) return;
      const { status } = await adminFetch(`/api/sessions/${createdId}`, {
        method: 'PUT',
        body: { name: 'Updated Session' },
      });
      expect(status).toBe(200);
    });
  });

  describe('DELETE /api/sessions/[id]', () => {
    it('admin can delete session', async () => {
      if (!createdId) return;
      const { status } = await adminFetch(`/api/sessions/${createdId}`, {
        method: 'DELETE',
      });
      expect(status).toBe(200);
    });
  });
});
