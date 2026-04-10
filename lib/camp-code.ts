const CAMP_CODE_KEY = 'camp_code';
const FACULTY_ID_KEY = 'faculty_id';

export function getCampCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CAMP_CODE_KEY);
}

export function setCampCode(code: string): void {
  localStorage.setItem(CAMP_CODE_KEY, code);
}

export function clearCampCode(): void {
  localStorage.removeItem(CAMP_CODE_KEY);
  localStorage.removeItem(FACULTY_ID_KEY);
}

export function setTeacherFacultyId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FACULTY_ID_KEY, id);
}

export function getTeacherFacultyId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FACULTY_ID_KEY);
}

export function clearTeacherFacultyId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FACULTY_ID_KEY);
}

export function getCampCodeHeaders(): Record<string, string> {
  const code = getCampCode();
  const facultyId = getTeacherFacultyId();
  const headers: Record<string, string> = {};
  if (code) headers['X-Camp-Code'] = code;
  if (facultyId) headers['X-Faculty-Id'] = facultyId;
  return headers;
}
