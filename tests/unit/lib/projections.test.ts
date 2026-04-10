import { describe, it, expect } from 'vitest';
import { facultyForTeacher, sessionStudentsForTeacher } from '@/lib/projections';
import type { Faculty, SessionStudentDenormalized } from '@/lib/types';

describe('facultyForTeacher', () => {
  it('strips email from faculty records', () => {
    const input: Faculty[] = [
      {
        id: 'f1',
        first_name: 'A',
        last_name: 'B',
        role: 'Director',
        email: 'a@b.com',
        created_at: '2026-01-01',
      },
    ];
    const out = facultyForTeacher(input);
    expect(out[0]).not.toHaveProperty('email');
    expect(out[0]).toEqual({
      id: 'f1',
      first_name: 'A',
      last_name: 'B',
      role: 'Director',
    });
  });

  it('handles missing email field gracefully', () => {
    const out = facultyForTeacher([
      { id: 'f2', first_name: 'C', last_name: 'D', role: 'Staff', created_at: '2026-01-01' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('email');
  });
});

describe('sessionStudentsForTeacher', () => {
  it('strips dorm_room from session student records', () => {
    const input: SessionStudentDenormalized[] = [
      {
        id: 'ss1',
        session_id: 's1',
        student_id: 'st1',
        first_name: 'Jane',
        last_initial: 'D',
        instrument: 'Flute',
        ensemble: 'Band 1',
        dorm_room: 'Hall-204',
      },
    ];
    const out = sessionStudentsForTeacher(input);
    expect(out[0]).not.toHaveProperty('dorm_room');
    expect(out[0].first_name).toBe('Jane');
  });

  it('preserves required fields', () => {
    const input: SessionStudentDenormalized[] = [
      {
        id: 'ss1',
        session_id: 's1',
        student_id: 'st1',
        first_name: 'Jane',
        last_initial: 'D',
        instrument: 'Flute',
        ensemble: 'Band 1',
      },
    ];
    const out = sessionStudentsForTeacher(input);
    expect(out[0]).toMatchObject({
      id: 'ss1',
      session_id: 's1',
      student_id: 'st1',
      first_name: 'Jane',
      instrument: 'Flute',
    });
  });
});
