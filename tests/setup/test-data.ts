// Shared test data factories — all data is fake, no real PII

export const PII_FIELDS = [
  'last_name',
  'email',
  'cell_phone',
  'parent_phone',
  'parent_first_name',
  'parent_last_name',
  'medical_notes',
] as const;

export const SAFE_FIELDS = [
  'first_name',
  'last_initial',
  'preferred_name',
  'instrument',
  'ensemble',
  'dorm_room',
] as const;

export function makeStudent(overrides: Record<string, any> = {}) {
  return {
    first_name: 'Alice',
    last_name: 'Johnson',
    preferred_name: 'Ali',
    gender: 'F',
    division: 'Residential',
    instrument: 'Flute',
    ensemble: 'Concert Band',
    chair_number: 1,
    dorm_building: 'Chitwood',
    dorm_room: '204',
    email: 'alice.johnson@fakeemail.test',
    cell_phone: '555-100-0001',
    parent_first_name: 'Bob',
    parent_last_name: 'Johnson',
    parent_phone: '555-200-0001',
    medical_notes: 'Allergic to peanuts',
    additional_info: '',
    ...overrides,
  };
}

export function makeFaculty(overrides: Record<string, any> = {}) {
  return {
    first_name: 'Dr. Sarah',
    last_name: 'Williams',
    role: 'Director',
    email: 'sarah.williams@fakeemail.test',
    ...overrides,
  };
}

export function makePeriod(overrides: Record<string, any> = {}) {
  return {
    number: 1,
    name: 'Period 1',
    start_time: '08:00',
    end_time: '08:50',
    ...overrides,
  };
}

export function makeSession(overrides: Record<string, any> = {}) {
  return {
    name: 'Concert Band Rehearsal',
    type: 'rehearsal' as const,
    location: 'Band Hall',
    period_id: 'period-1',
    faculty_id: 'faculty-1',
    ensemble: 'Concert Band',
    instrument: undefined,
    ...overrides,
  };
}

export function makeAttendance(overrides: Record<string, any> = {}) {
  return {
    student_id: 'student-1',
    session_id: 'session-1',
    date: '2026-06-08',
    status: 'present' as const,
    marked_by: 'teacher',
    ...overrides,
  };
}

/**
 * Generate a batch of N students with unique data
 */
export function makeStudents(count: number) {
  const firstNames = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'];
  const lastNames = ['Anderson', 'Brown', 'Clark', 'Davis', 'Evans', 'Foster', 'Garcia', 'Harris', 'Irving', 'Jones'];
  const instruments = ['Flute', 'Clarinet', 'Trumpet', 'Trombone', 'Percussion', 'Violin', 'Viola', 'Cello', 'Oboe', 'Bassoon'];
  const ensembles = ['Concert Band', 'Symphony Orchestra', 'Jazz Ensemble'];

  return Array.from({ length: count }, (_, i) => makeStudent({
    first_name: firstNames[i % firstNames.length],
    last_name: lastNames[i % lastNames.length],
    instrument: instruments[i % instruments.length],
    ensemble: ensembles[i % ensembles.length],
    email: `student${i}@fakeemail.test`,
    cell_phone: `555-100-${String(i).padStart(4, '0')}`,
    parent_phone: `555-200-${String(i).padStart(4, '0')}`,
    dorm_room: `${100 + i}`,
  }));
}
