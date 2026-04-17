/**
 * Import Schemas — canonical field definitions for admin imports.
 *
 * Each schema describes:
 *   - the DB field keys we want to produce
 *   - type metadata the UI can use (required/optional, input type)
 *   - header aliases used by `autoDetectMapping` in `import-parsers.ts`
 *     to wire arbitrary CSV/XLSX column headers to these keys
 *   - per-field validators + transforms for data cleaning
 *
 * The field list order is also the order the mapping UI will render
 * (Task 19 / `/admin/import`), so keep required fields near the top.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'email' | 'phone' | 'date';

export interface FieldDef {
  /** Canonical DB field name (e.g., "first_name"). */
  key: string;
  /** Human-readable label for the UI column list. */
  label: string;
  /** Input type — drives default validation. */
  type: FieldType;
  /** Whether a value is required. Empty values on required fields fail normalization. */
  required: boolean;
  /**
   * Lowercase substrings used for column auto-detection. The detector
   * lowercases the incoming header and checks `header.includes(alias)`,
   * so aliases should be partial matches (e.g., "fname" matches "Fname",
   * "First-Name" alike). Order matters: first match wins.
   */
  aliases?: string[];
  /** Returns an error message, or null if the value is acceptable. */
  validate?: (value: string) => string | null;
  /** Transforms the raw string into the stored value (may be typed). */
  transform?: (value: string) => unknown;
}

export type EntityName = 'students' | 'faculty' | 'sessions' | 'enrollments';

export interface ImportSchema {
  entity: EntityName;
  label: string;
  fields: FieldDef[];
  /** Hint for dedupe/upsert: field key (or composite) identifying a row. */
  uniqueKey?: string | string[];
}

// -------- shared validators / transforms --------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (!value) return null; // empty handled by required-check upstream
  return EMAIL_RE.test(value.trim()) ? null : 'Invalid email';
}

export function transformEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePhone(value: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length === 10 ? null : 'Phone must be 10 digits';
}

export function transformPhone(value: string): string {
  const digits = value.replace(/\D+/g, '');
  if (digits.length !== 10) return value; // leave alone if invalid; validate() flags it
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validateDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 'Invalid date' : null;
  }
  // US-style MM/DD/YYYY
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    return null;
  }
  return 'Invalid date';
}

export function transformDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return trimmed;
}

export function transformString(value: string): string {
  return value.trim();
}

export function transformNumber(value: string): number | undefined {
  const n = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const SESSION_TYPES = [
  'rehearsal',
  'sectional',
  'masterclass',
  'elective',
  'assembly',
  'lunch',
] as const;

function validateSessionType(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return `Invalid type (expected one of: ${SESSION_TYPES.join(', ')})`;
  return SESSION_TYPES.includes(trimmed as (typeof SESSION_TYPES)[number])
    ? null
    : `Invalid type (expected one of: ${SESSION_TYPES.join(', ')})`;
}

// -------- STUDENT --------

export const STUDENT_SCHEMA: ImportSchema = {
  entity: 'students',
  label: 'Students',
  uniqueKey: ['first_name', 'last_name'],
  fields: [
    {
      key: 'first_name',
      label: 'First Name',
      type: 'string',
      required: true,
      aliases: ['first name', 'firstname', 'fname', 'given name', 'player first name'],
      transform: transformString,
    },
    {
      key: 'last_name',
      label: 'Last Name',
      type: 'string',
      required: true,
      aliases: ['last name', 'lastname', 'lname', 'surname', 'family name', 'player last name'],
      transform: transformString,
    },
    {
      key: 'preferred_name',
      label: 'Preferred Name',
      type: 'string',
      required: false,
      aliases: ['preferred name', 'nickname', 'name tag', 'preferred'],
      transform: transformString,
    },
    {
      key: 'gender',
      label: 'Gender',
      type: 'string',
      required: false,
      aliases: ['gender', 'sex'],
      transform: transformString,
    },
    {
      key: 'division',
      label: 'Division',
      type: 'string',
      required: false,
      aliases: ['division', 'camper type', 'division name'],
      transform: transformString,
    },
    {
      key: 'instrument',
      label: 'Instrument',
      type: 'string',
      required: true,
      aliases: ['instrument', 'audition instrument'],
      transform: transformString,
    },
    {
      key: 'ensemble',
      label: 'Ensemble',
      type: 'string',
      required: false,
      aliases: ['ensemble', 'band', 'orchestra', 'group'],
      transform: transformString,
    },
    {
      key: 'chair_number',
      label: 'Chair Number',
      type: 'number',
      required: false,
      aliases: ['chair', 'chair number', 'seat'],
      transform: (v) => transformNumber(v),
    },
    {
      key: 'dorm_building',
      label: 'Dorm Building',
      type: 'string',
      required: false,
      aliases: ['dorm', 'building', 'dorm building', 'residence'],
      transform: transformString,
    },
    {
      key: 'dorm_room',
      label: 'Dorm Room',
      type: 'string',
      required: false,
      aliases: ['room', 'dorm room', 'room number'],
      transform: transformString,
    },
    {
      key: 'email',
      label: 'Email',
      type: 'email',
      required: false,
      aliases: ['email', 'camper email', 'student email', 'e-mail'],
      validate: validateEmail,
      transform: transformEmail,
    },
    {
      key: 'cell_phone',
      label: 'Cell Phone',
      type: 'phone',
      required: false,
      aliases: ['cell', 'phone', 'mobile', 'camper cell', 'cell number', 'camper phone'],
      validate: validatePhone,
      transform: transformPhone,
    },
    {
      key: 'parent_first_name',
      label: 'Parent First Name',
      type: 'string',
      required: false,
      aliases: ['parent first', 'guardian first', 'parent/guardian first'],
      transform: transformString,
    },
    {
      key: 'parent_last_name',
      label: 'Parent Last Name',
      type: 'string',
      required: false,
      aliases: ['parent last', 'guardian last', 'parent/guardian last'],
      transform: transformString,
    },
    {
      key: 'parent_phone',
      label: 'Parent Phone',
      type: 'phone',
      required: false,
      aliases: ['parent phone', 'guardian phone', 'parent/guardian cell', 'emergency contact phone'],
      validate: validatePhone,
      transform: transformPhone,
    },
    {
      key: 'medical_notes',
      label: 'Medical Notes',
      type: 'string',
      required: false,
      aliases: ['medical', 'allergies', 'medical notes', 'notes', 'medications'],
      transform: transformString,
    },
  ],
};

// -------- FACULTY --------

export const FACULTY_SCHEMA: ImportSchema = {
  entity: 'faculty',
  label: 'Faculty',
  uniqueKey: ['first_name', 'last_name'],
  fields: [
    {
      key: 'first_name',
      label: 'First Name',
      type: 'string',
      required: true,
      aliases: ['first name', 'firstname', 'fname', 'given name'],
      transform: transformString,
    },
    {
      key: 'last_name',
      label: 'Last Name',
      type: 'string',
      required: true,
      aliases: ['last name', 'lastname', 'lname', 'surname'],
      transform: transformString,
    },
    {
      key: 'role',
      label: 'Role',
      type: 'string',
      required: true,
      aliases: ['role', 'assignment', 'position', 'title'],
      transform: transformString,
    },
    {
      key: 'email',
      label: 'Email',
      type: 'email',
      required: false,
      aliases: ['email', 'e-mail'],
      validate: validateEmail,
      transform: transformEmail,
    },
  ],
};

// -------- SESSION --------

export const SESSION_SCHEMA: ImportSchema = {
  entity: 'sessions',
  label: 'Sessions',
  uniqueKey: ['name', 'period_name'],
  fields: [
    {
      key: 'name',
      label: 'Session Name',
      type: 'string',
      required: true,
      aliases: ['name', 'session', 'session name', 'title'],
      transform: transformString,
    },
    {
      key: 'type',
      label: 'Type',
      type: 'string',
      required: true,
      aliases: ['type', 'session type', 'category'],
      validate: validateSessionType,
      transform: (v) => v.trim().toLowerCase(),
    },
    {
      key: 'period_name',
      label: 'Period',
      type: 'string',
      required: true,
      aliases: ['period', 'period name', 'time slot', 'timeslot'],
      transform: transformString,
    },
    {
      key: 'location',
      label: 'Location',
      type: 'string',
      required: false,
      aliases: ['location', 'room', 'venue'],
      transform: transformString,
    },
    {
      key: 'ensemble',
      label: 'Ensemble',
      type: 'string',
      required: false,
      aliases: ['ensemble', 'band', 'orchestra'],
      transform: transformString,
    },
    {
      key: 'instrument',
      label: 'Instrument',
      type: 'string',
      required: false,
      aliases: ['instrument'],
      transform: transformString,
    },
    {
      key: 'faculty_id',
      label: 'Faculty',
      type: 'string',
      required: false,
      aliases: ['faculty', 'faculty id', 'teacher', 'instructor'],
      transform: transformString,
    },
  ],
};

// -------- ENROLLMENT --------

export const ENROLLMENT_SCHEMA: ImportSchema = {
  entity: 'enrollments',
  label: 'Enrollments',
  uniqueKey: ['student_name', 'session_name'],
  fields: [
    {
      key: 'student_name',
      label: 'Student Name',
      type: 'string',
      required: true,
      aliases: ['student', 'student name', 'camper', 'camper name', 'player'],
      transform: transformString,
    },
    {
      key: 'session_name',
      label: 'Session Name',
      type: 'string',
      required: true,
      aliases: ['session', 'session name', 'class', 'rehearsal'],
      transform: transformString,
    },
  ],
};

// -------- registry --------

export const ALL_SCHEMAS: Record<EntityName, ImportSchema> = {
  students: STUDENT_SCHEMA,
  faculty: FACULTY_SCHEMA,
  sessions: SESSION_SCHEMA,
  enrollments: ENROLLMENT_SCHEMA,
};

export function getSchema(entity: EntityName): ImportSchema {
  const schema = ALL_SCHEMAS[entity];
  if (!schema) {
    throw new Error(
      `Unknown import entity: ${entity}. Expected one of: ${Object.keys(ALL_SCHEMAS).join(', ')}`,
    );
  }
  return schema;
}
