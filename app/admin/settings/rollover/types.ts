/**
 * Shared types for the rollover wizard. The server contract lives in
 * `app/api/camps/rollover/route.ts` — keep this mirrored if the API shape
 * changes.
 */

export type Step = 'input' | 'preview' | 'success';

export interface RolloverResult {
  dry_run: boolean;
  old_id: string;
  new_id: string;
  new_camp_code: string;
  archived: { attendance: number; session_students: number };
  cleared: { attendance: number; session_students: number };
}

export interface FormState {
  newYear: string;
  newStartDate: string;
  newEndDate: string;
  timezone: string;
  customTimezone: string;
  clearEnsembleAssignments: boolean;
}

export const TIMEZONE_OPTIONS = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
];
