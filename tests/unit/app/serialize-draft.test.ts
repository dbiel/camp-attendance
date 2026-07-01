import { describe, it, expect } from 'vitest';
import { serializeDraft, type StudentDraft } from '@/app/admin/data/students/EditStudentModal';

describe('serializeDraft', () => {
  describe('add mode (default)', () => {
    it('omits blank optional fields entirely', () => {
      const draft: StudentDraft = {
        first_name: 'A',
        last_name: 'B',
        instrument: 'Flute',
        dorm_room: '',
        chair_number: undefined,
      };
      const out = serializeDraft(draft, 'add');
      expect(out).not.toHaveProperty('dorm_room');
      expect(out).not.toHaveProperty('chair_number');
    });
  });

  describe('edit mode', () => {
    it('sends an explicit empty string for a field the user just cleared', () => {
      const draft: StudentDraft = {
        first_name: 'A',
        last_name: 'B',
        instrument: 'Flute',
        dorm_room: '', // was previously set, user blanked it out
      };
      const out = serializeDraft(draft, 'edit');
      expect(out.dorm_room).toBe('');
    });

    it('sends null for a cleared chair_number', () => {
      const draft: StudentDraft = {
        first_name: 'A',
        last_name: 'B',
        instrument: 'Flute',
        chair_number: undefined,
      };
      const out = serializeDraft(draft, 'edit');
      expect((out as Record<string, unknown>).chair_number).toBeNull();
    });

    it('still parses a real chair_number to a number', () => {
      const draft: StudentDraft = {
        first_name: 'A',
        last_name: 'B',
        instrument: 'Flute',
        chair_number: 3,
      };
      const out = serializeDraft(draft, 'edit');
      expect(out.chair_number).toBe(3);
    });

    it('drops undefined/null (never-touched) fields but keeps set ones', () => {
      const draft: StudentDraft = {
        first_name: 'A',
        last_name: 'B',
        instrument: 'Flute',
        preferred_name: undefined,
        dorm_building: 'North',
      };
      const out = serializeDraft(draft, 'edit');
      expect(out).not.toHaveProperty('preferred_name');
      expect(out.dorm_building).toBe('North');
    });
  });
});
