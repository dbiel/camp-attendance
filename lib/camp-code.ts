const CAMP_CODE_KEY = 'camp_code';

export function getCampCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CAMP_CODE_KEY);
}

export function setCampCode(code: string): void {
  localStorage.setItem(CAMP_CODE_KEY, code);
}

export function clearCampCode(): void {
  localStorage.removeItem(CAMP_CODE_KEY);
}

export function getCampCodeHeaders(): Record<string, string> {
  const code = getCampCode();
  if (!code) return {};
  return { 'X-Camp-Code': code };
}
