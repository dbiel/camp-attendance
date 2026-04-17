/**
 * Import Schemas Unit Tests
 *
 * Tests field definitions, validators, and transforms for the
 * admin import rewrite (Phase 6). The schemas drive auto-mapping
 * of CSV/XLSX headers onto the canonical DB field keys, so the
 * validators here are also the single source of truth for
 * admin-paste input cleaning.
 */
import { describe, it, expect } from 'vitest';
import {
  STUDENT_SCHEMA,
  FACULTY_SCHEMA,
  SESSION_SCHEMA,
  ENROLLMENT_SCHEMA,
  ALL_SCHEMAS,
  getSchema,
  type FieldDef,
} from '@/lib/import-schemas';

function field(schema: { fields: FieldDef[] }, key: string): FieldDef {
  const f = schema.fields.find((x) => x.key === key);
  if (!f) throw new Error(`field ${key} not found`);
  return f;
}

describe('STUDENT_SCHEMA', () => {
  it('marks first_name, last_name, instrument as required', () => {
    expect(field(STUDENT_SCHEMA, 'first_name').required).toBe(true);
    expect(field(STUDENT_SCHEMA, 'last_name').required).toBe(true);
    expect(field(STUDENT_SCHEMA, 'instrument').required).toBe(true);
  });

  it('marks medical_notes, preferred_name, parent_* as optional', () => {
    expect(field(STUDENT_SCHEMA, 'medical_notes').required).toBe(false);
    expect(field(STUDENT_SCHEMA, 'preferred_name').required).toBe(false);
    expect(field(STUDENT_SCHEMA, 'parent_first_name').required).toBe(false);
    expect(field(STUDENT_SCHEMA, 'parent_phone').required).toBe(false);
  });

  it('has entity set to students and a label', () => {
    expect(STUDENT_SCHEMA.entity).toBe('students');
    expect(STUDENT_SCHEMA.label).toBeTruthy();
  });

  it('uniqueKey dedupes by first_name + last_name', () => {
    expect(STUDENT_SCHEMA.uniqueKey).toEqual(['first_name', 'last_name']);
  });

  it('includes the core student fields (coverage check)', () => {
    const keys = STUDENT_SCHEMA.fields.map((f) => f.key);
    for (const k of [
      'first_name',
      'last_name',
      'preferred_name',
      'gender',
      'division',
      'instrument',
      'ensemble',
      'chair_number',
      'dorm_building',
      'dorm_room',
      'email',
      'cell_phone',
      'parent_first_name',
      'parent_last_name',
      'parent_phone',
      'medical_notes',
    ]) {
      expect(keys).toContain(k);
    }
  });
});

describe('FACULTY_SCHEMA', () => {
  it('requires first_name, last_name, role', () => {
    expect(field(FACULTY_SCHEMA, 'first_name').required).toBe(true);
    expect(field(FACULTY_SCHEMA, 'last_name').required).toBe(true);
    expect(field(FACULTY_SCHEMA, 'role').required).toBe(true);
  });

  it('makes email optional', () => {
    expect(field(FACULTY_SCHEMA, 'email').required).toBe(false);
  });
});

describe('SESSION_SCHEMA', () => {
  it('requires name, type, period_name', () => {
    expect(field(SESSION_SCHEMA, 'name').required).toBe(true);
    expect(field(SESSION_SCHEMA, 'type').required).toBe(true);
    expect(field(SESSION_SCHEMA, 'period_name').required).toBe(true);
  });

  it('accepts all six session types', () => {
    const validator = field(SESSION_SCHEMA, 'type').validate!;
    for (const t of ['rehearsal', 'sectional', 'masterclass', 'elective', 'assembly', 'lunch']) {
      expect(validator(t)).toBeNull();
    }
  });

  it('rejects invalid session types', () => {
    const validator = field(SESSION_SCHEMA, 'type').validate!;
    expect(validator('concert')).toMatch(/type/i);
    expect(validator('')).toBeTruthy();
  });
});

describe('ENROLLMENT_SCHEMA', () => {
  it('requires student_name and session_name', () => {
    expect(field(ENROLLMENT_SCHEMA, 'student_name').required).toBe(true);
    expect(field(ENROLLMENT_SCHEMA, 'session_name').required).toBe(true);
  });
});

describe('phone validator/transform', () => {
  const f = field(STUDENT_SCHEMA, 'cell_phone');

  it('accepts a formatted 10-digit phone', () => {
    expect(f.validate!('555-123-4567')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(f.validate!('abc')).toMatch(/10 digits/i);
  });

  it('rejects too few digits', () => {
    expect(f.validate!('555-1234')).toMatch(/10 digits/i);
  });

  it('transforms stripped digits into (XXX) XXX-XXXX', () => {
    expect(f.transform!('5551234567')).toBe('(555) 123-4567');
    expect(f.transform!('555.123.4567')).toBe('(555) 123-4567');
    expect(f.transform!('(555) 123-4567')).toBe('(555) 123-4567');
  });
});

describe('email validator/transform', () => {
  const f = field(STUDENT_SCHEMA, 'email');

  it('accepts a valid email', () => {
    expect(f.validate!('a@b.co')).toBeNull();
  });

  it('rejects bogus values', () => {
    expect(f.validate!('notanemail')).toMatch(/email/i);
    expect(f.validate!('no@tld')).toMatch(/email/i);
  });

  it('lowercases and trims', () => {
    expect(f.transform!('  A@B.CO ')).toBe('a@b.co');
  });
});

describe('date validator', () => {
  // Build a fake date field to test validator logic. Use SESSION_SCHEMA's
  // type validator via a hand-rolled FieldDef would require internal helpers,
  // so reach into ENROLLMENT_SCHEMA/shared helpers if provided.
  // Instead, assert via getSchema helper pattern: construct a date field
  // through the exported shape not being strictly necessary — instead we
  // assert a known date field exists somewhere. No date field in current
  // schemas, so assert the library exports a `validateDate` via a field-like
  // probe: add a synthetic FieldDef using the generic string type would miss
  // the date path. This block relies on `validateDate` exposed alongside the
  // schemas to keep the test meaningful.
  it('exports a date validator via the library module', async () => {
    const mod = await import('@/lib/import-schemas');
    expect(typeof mod.validateDate).toBe('function');
    expect(mod.validateDate('2026-06-08')).toBeNull();
    expect(mod.validateDate('6/8/2026')).toBeNull();
    expect(mod.validateDate('bad')).toMatch(/date/i);
  });
});

describe('ALL_SCHEMAS registry and getSchema', () => {
  it('exposes all four schemas', () => {
    expect(ALL_SCHEMAS.students).toBe(STUDENT_SCHEMA);
    expect(ALL_SCHEMAS.faculty).toBe(FACULTY_SCHEMA);
    expect(ALL_SCHEMAS.sessions).toBe(SESSION_SCHEMA);
    expect(ALL_SCHEMAS.enrollments).toBe(ENROLLMENT_SCHEMA);
  });

  it('getSchema returns the right schema', () => {
    expect(getSchema('students')).toBe(STUDENT_SCHEMA);
    expect(getSchema('faculty')).toBe(FACULTY_SCHEMA);
    expect(getSchema('sessions')).toBe(SESSION_SCHEMA);
    expect(getSchema('enrollments')).toBe(ENROLLMENT_SCHEMA);
  });

  it('getSchema throws on invalid entity', () => {
    // @ts-expect-error — deliberately invalid
    expect(() => getSchema('bogus')).toThrow();
  });
});
