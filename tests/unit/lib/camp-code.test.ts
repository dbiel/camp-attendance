/**
 * Camp Code Unit Tests
 *
 * Tests localStorage-based camp code helpers.
 * Manually mocks localStorage since jsdom environment has issues in Vitest 4.x.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const key in store) delete store[key]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};

// Set up global localStorage before importing the module
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
// Ensure window is defined (camp-code.ts checks typeof window)
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { getCampCode, setCampCode, clearCampCode, getCampCodeHeaders } from '@/lib/camp-code';

describe('Camp Code helpers', () => {
  beforeEach(() => {
    for (const key in store) delete store[key];
    vi.clearAllMocks();
  });

  describe('getCampCode', () => {
    it('returns null when no code is stored', () => {
      expect(getCampCode()).toBeNull();
    });

    it('returns stored code', () => {
      store['camp_code'] = 'camp2026';
      expect(getCampCode()).toBe('camp2026');
    });
  });

  describe('setCampCode', () => {
    it('stores code in localStorage', () => {
      setCampCode('camp2026');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('camp_code', 'camp2026');
      expect(store['camp_code']).toBe('camp2026');
    });

    it('overwrites existing code', () => {
      setCampCode('old-code');
      setCampCode('new-code');
      expect(store['camp_code']).toBe('new-code');
    });
  });

  describe('clearCampCode', () => {
    it('removes code from localStorage', () => {
      store['camp_code'] = 'camp2026';
      clearCampCode();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('camp_code');
      expect(store['camp_code']).toBeUndefined();
    });

    it('does nothing if no code stored', () => {
      clearCampCode(); // should not throw
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('camp_code');
    });
  });

  describe('getCampCodeHeaders', () => {
    it('returns empty object when no code stored', () => {
      expect(getCampCodeHeaders()).toEqual({});
    });

    it('returns X-Camp-Code header when code is stored', () => {
      store['camp_code'] = 'camp2026';
      expect(getCampCodeHeaders()).toEqual({ 'X-Camp-Code': 'camp2026' });
    });
  });
});
