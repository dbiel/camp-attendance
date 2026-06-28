// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  activityOf,
  isUnseen,
  readSeen,
  markSeen,
  initSeenIfEmpty,
  isInitialized,
  type SeenMap,
} from '@/lib/seen';

const t1 = '2026-06-27T10:00:00.000Z';
const t2 = '2026-06-27T11:00:00.000Z';

describe('activityOf', () => {
  it('prefers last_activity_at, falls back to created_at', () => {
    expect(activityOf({ id: 'a', created_at: t1, last_activity_at: t2 })).toBe(t2);
    expect(activityOf({ id: 'a', created_at: t1 })).toBe(t1);
  });
});

describe('isUnseen (pure)', () => {
  it('is unseen when activity is newer than what was recorded', () => {
    const map: SeenMap = { a: t1 };
    expect(isUnseen({ id: 'a', created_at: t1, last_activity_at: t2 }, map)).toBe(true);
  });

  it('is seen when activity equals or precedes what was recorded', () => {
    const map: SeenMap = { a: t2 };
    expect(isUnseen({ id: 'a', created_at: t1, last_activity_at: t2 }, map)).toBe(false);
    expect(isUnseen({ id: 'a', created_at: t1, last_activity_at: t1 }, map)).toBe(false);
  });

  it('unknown id: defaults to seen, but badges as new when treatUnknownAsNew', () => {
    expect(isUnseen({ id: 'x', created_at: t1 }, {})).toBe(false);
    expect(isUnseen({ id: 'x', created_at: t1 }, {}, { treatUnknownAsNew: true })).toBe(true);
  });
});

describe('localStorage-backed helpers', () => {
  beforeEach(() => {
    // Install a deterministic in-memory localStorage (jsdom's isn't reliably
    // present in this node/jsdom hybrid). lib/seen reads window.localStorage.
    const store: Record<string, string> = {};
    const mock = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    };
    Object.defineProperty(window, 'localStorage', { value: mock, configurable: true });
  });

  it('starts uninitialized and reads an empty map', () => {
    expect(isInitialized()).toBe(false);
    expect(readSeen()).toEqual({});
  });

  it('initSeenIfEmpty seeds all current cases as seen, then is a no-op', () => {
    initSeenIfEmpty([
      { id: 'a', created_at: t1 },
      { id: 'b', created_at: t1, last_activity_at: t2 },
    ]);
    expect(isInitialized()).toBe(true);
    expect(readSeen()).toEqual({ a: t1, b: t2 });

    // After init, none of the seeded ones badge (even with treatUnknownAsNew).
    const map = readSeen();
    expect(isUnseen({ id: 'a', created_at: t1 }, map, { treatUnknownAsNew: true })).toBe(false);

    // A brand-new id (not seeded) now badges as new.
    expect(isUnseen({ id: 'c', created_at: t2 }, map, { treatUnknownAsNew: true })).toBe(true);

    // No-op once initialized: a later call must not overwrite.
    initSeenIfEmpty([{ id: 'a', created_at: t2, last_activity_at: t2 }]);
    expect(readSeen().a).toBe(t1);
  });

  it('markSeen records the current activity → clears the badge', () => {
    const c = { id: 'a', created_at: t1, last_activity_at: t2 };
    expect(isUnseen(c, readSeen(), { treatUnknownAsNew: true })).toBe(true);
    markSeen(c);
    expect(isUnseen(c, readSeen(), { treatUnknownAsNew: true })).toBe(false);
  });

  it('a new update after markSeen re-badges', () => {
    const c = { id: 'a', created_at: t1, last_activity_at: t1 };
    markSeen(c);
    const updated = { id: 'a', created_at: t1, last_activity_at: t2 };
    expect(isUnseen(updated, readSeen(), { treatUnknownAsNew: true })).toBe(true);
  });
});
