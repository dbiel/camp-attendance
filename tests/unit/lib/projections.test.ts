import { describe, it, expect } from 'vitest';
import { facultyForTeacher, sessionStudentsForTeacher, toStaffLinkProjection } from '@/lib/projections';
import type { Faculty, SessionStudentDenormalized, Student } from '@/lib/types';
import type { Case, CaseEvent } from '@/lib/cases';

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

describe('toStaffLinkProjection', () => {
  const student: Student = {
    id: 'st1',
    first_name: 'Johnny',
    last_name: 'Appleseed',
    last_initial: 'A',
    division: 'HS',
    instrument: 'Trumpet',
    ensemble: 'Wind Ensemble',
    dorm_room: 'Hall-204',
    cell_phone: '+18065551234',
    parent_first_name: 'Mary',
    parent_last_name: 'Appleseed',
    parent_phone: '+18065559999',
    medical_notes: 'Peanut allergy',
    created_at: '2026-06-01',
  };

  const theCase: Case = {
    id: 'case1',
    status: 'active',
    student_id: 'st1',
    student_name: 'Johnny Appleseed',
    reporter_contact_id: 'c1',
    reporter_name: 'Mr. Jones',
    summary: 'Missing from trumpet sectional',
    raw_text: 'SENSITIVE raw pasted report text with parent phone in it',
    session_label: 'Period 3 sectional',
    share_token: 'tok',
    share_issued_at: '2026-06-22T12:00:00.000Z',
    share_expires_at: '2026-06-22T16:00:00.000Z',
    share_revoked: false,
    share_recipient_label: 'Counselor Jane',
    resolution_note: null,
    created_by: 'david@bieldentalcabinets.com',
    created_at: '2026-06-22T12:00:00.000Z',
    resolved_at: null,
  };

  const staffUpdates: CaseEvent[] = [
    {
      id: 'e1',
      case_id: 'case1',
      type: 'staff_update',
      body: 'Checked the dorm, not there.',
      actor: 'Counselor Jane',
      created_at: '2026-06-22T12:30:00.000Z',
    },
  ];

  it('includes ONLY the scoped keys', () => {
    const out = toStaffLinkProjection(theCase, student, staffUpdates);
    expect(Object.keys(out).sort()).toEqual(
      ['dorm_room', 'first_name', 'instrument', 'last_initial', 'report_summary', 'status', 'updates'].sort()
    );
  });

  it('derives last_initial as first char of last name + "."', () => {
    const out = toStaffLinkProjection(theCase, student, staffUpdates);
    expect(out.last_initial).toBe('A.');
  });

  it('maps only staff_update events into updates (no internal notes)', () => {
    const mixed: CaseEvent[] = [
      ...staffUpdates,
      { id: 'e2', case_id: 'case1', type: 'note', body: 'INTERNAL David note', actor: 'david', created_at: '2026-06-22T12:40:00.000Z' },
      { id: 'e3', case_id: 'case1', type: 'parent_texted', body: 'Texted parent', actor: 'david', created_at: '2026-06-22T12:45:00.000Z' },
    ];
    const out = toStaffLinkProjection(theCase, student, mixed);
    expect(out.updates).toHaveLength(1);
    expect(out.updates[0]!.body).toBe('Checked the dorm, not there.');
    expect(JSON.stringify(out.updates)).not.toContain('INTERNAL David note');
  });

  it('leaks NO PII or sibling data — assert absence of forbidden keys across the whole payload', () => {
    const out = toStaffLinkProjection(theCase, student, staffUpdates);
    const blob = JSON.stringify(out);
    // Structural key checks
    expect(out).not.toHaveProperty('last_name');
    expect(out).not.toHaveProperty('medical_notes');
    expect(out).not.toHaveProperty('parent_first_name');
    expect(out).not.toHaveProperty('parent_last_name');
    expect(out).not.toHaveProperty('parent_phone');
    expect(out).not.toHaveProperty('cell_phone');
    expect(out).not.toHaveProperty('raw_text');
    expect(out).not.toHaveProperty('student_id');
    expect(out).not.toHaveProperty('reporter_name');
    expect(out).not.toHaveProperty('reporter_contact_id');
    expect(out).not.toHaveProperty('share_token');
    expect(out).not.toHaveProperty('prior_cases');
    expect(out).not.toHaveProperty('cases');
    // Value-level leak checks across the serialized payload
    expect(blob).not.toContain('Appleseed'); // full last name
    expect(blob).not.toContain('Peanut'); // medical notes
    expect(blob).not.toContain('+18065559999'); // parent phone
    expect(blob).not.toContain('+18065551234'); // cell phone
    expect(blob).not.toContain('SENSITIVE raw'); // raw_text
    expect(blob).not.toContain('Mr. Jones'); // reporter
    expect(blob).not.toContain('tok'); // share_token
  });

  it('handles an empty last name without throwing', () => {
    const out = toStaffLinkProjection(theCase, { ...student, last_name: '' }, []);
    expect(out.last_initial).toBe('');
  });
});
