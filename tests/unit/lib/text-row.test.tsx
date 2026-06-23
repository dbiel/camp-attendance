import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/app/admin/inbox/TextRow';

describe('relativeTime', () => {
  const NOW = new Date('2026-06-22T12:00:00.000Z').getTime();

  it('shows "just now" under a minute', () => {
    expect(relativeTime('2026-06-22T11:59:30.000Z', NOW)).toBe('just now');
  });

  it('shows minutes under an hour', () => {
    expect(relativeTime('2026-06-22T11:45:00.000Z', NOW)).toBe('15m ago');
  });

  it('shows hours and minutes under a day', () => {
    expect(relativeTime('2026-06-22T09:30:00.000Z', NOW)).toBe('2h 30m ago');
  });

  it('shows days past a day', () => {
    expect(relativeTime('2026-06-19T12:00:00.000Z', NOW)).toBe('3d ago');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(relativeTime('2026-06-22T12:05:00.000Z', NOW)).toBe('just now');
  });

  it('returns "" for an invalid date', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});
