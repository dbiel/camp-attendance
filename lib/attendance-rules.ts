export const ATTENDANCE_MOSTLY_TAKEN_THRESHOLD = 0.8;

export type CellState = 'not-started' | 'in-progress' | 'mostly-done' | 'has-absences';

export function deriveCellState(args: {
  total_students: number;
  marked_count: number;
  absent_count: number;
}): CellState {
  const { total_students, marked_count, absent_count } = args;
  if (absent_count > 0) return 'has-absences';
  if (total_students === 0 || marked_count === 0) return 'not-started';
  if (marked_count >= total_students * ATTENDANCE_MOSTLY_TAKEN_THRESHOLD) {
    return 'mostly-done';
  }
  return 'in-progress';
}
