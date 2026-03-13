/**
 * Students API Integration Tests
 */
import { describe, it, expect } from 'vitest';
import { adminFetch, teacherFetch } from '../../setup/api-client';
import { makeStudent } from '../../setup/test-data';

describe('Students API', () => {
  let createdId: string;

  describe('GET /api/students', () => {
    it('admin can list students', async () => {
      const { status, data } = await adminFetch('/api/students');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('teacher cannot list students', async () => {
      const { status } = await teacherFetch('/api/students');
      expect(status).toBe(403);
    });
  });

  describe('POST /api/students', () => {
    it('admin can create student', async () => {
      const student = makeStudent({ first_name: 'TestCreate', last_name: 'StudentZ' });
      const { status, data } = await adminFetch('/api/students', {
        method: 'POST',
        body: student,
      });
      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      createdId = data.id;
    });

    it('last_initial is auto-computed from last_name', async () => {
      if (!createdId) return;
      const { status, data } = await adminFetch(`/api/students/${createdId}`);
      expect(status).toBe(200);
      expect(data.last_initial).toBe('S'); // "StudentZ" → "S"
    });
  });

  describe('GET /api/students/[id]', () => {
    it('admin can get single student with full PII', async () => {
      if (!createdId) return;
      const { status, data } = await adminFetch(`/api/students/${createdId}`);
      expect(status).toBe(200);
      expect(data.first_name).toBe('TestCreate');
      expect(data.last_name).toBe('StudentZ');
      expect(data.email).toBeDefined();
      expect(data.medical_notes).toBeDefined();
    });

    it('returns 404 for nonexistent', async () => {
      const { status } = await adminFetch('/api/students/nonexistent-id');
      expect(status).toBe(404);
    });
  });

  describe('PUT /api/students/[id]', () => {
    it('admin can update student', async () => {
      if (!createdId) return;
      const { status } = await adminFetch(`/api/students/${createdId}`, {
        method: 'PUT',
        body: { first_name: 'UpdatedName' },
      });
      expect(status).toBe(200);

      // Verify update
      const { data } = await adminFetch(`/api/students/${createdId}`);
      expect(data.first_name).toBe('UpdatedName');
    });

    it('updating last_name recomputes last_initial', async () => {
      if (!createdId) return;
      await adminFetch(`/api/students/${createdId}`, {
        method: 'PUT',
        body: { last_name: 'Newname' },
      });
      const { data } = await adminFetch(`/api/students/${createdId}`);
      expect(data.last_initial).toBe('N');
    });
  });

  describe('DELETE /api/students/[id]', () => {
    it('admin can delete student', async () => {
      if (!createdId) return;
      const { status } = await adminFetch(`/api/students/${createdId}`, {
        method: 'DELETE',
      });
      expect(status).toBe(200);

      // Verify deleted
      const { status: getStatus } = await adminFetch(`/api/students/${createdId}`);
      expect(getStatus).toBe(404);
    });
  });
});
