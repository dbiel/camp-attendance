import { describe, it, expect } from 'vitest';
import { partitionActiveByHour } from '@/lib/active-board';
import { hourBucket } from '@/lib/date';

const mk = (id: string, iso: string) => ({ id, occurred_at: iso, created_at: iso }) as any;

describe('partitionActiveByHour', () => {
  // Use camp-tz hour buckets so the test is tz-correct.
  const a = mk('a', '2026-06-29T19:10:00Z'); // hour X
  const b = mk('b', '2026-06-29T19:40:00Z'); // hour X (later)
  const c = mk('c', '2026-06-29T18:30:00Z'); // hour X-1
  const nowKey = hourBucket('2026-06-29T19:50:00Z');

  it('splits this-hour from carried-over (older still-active)', () => {
    const { thisHour, carriedOver } = partitionActiveByHour([c, a, b], nowKey);
    expect(thisHour.map((x) => x.id)).toEqual(['b', 'a']); // newest-first
    expect(carriedOver.map((x) => x.id)).toEqual(['c']);
  });

  it('orders each group newest-first', () => {
    const { thisHour } = partitionActiveByHour([a, b], nowKey);
    expect(thisHour.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('puts everything in carried-over when nothing is in the current hour', () => {
    const futureKey = hourBucket('2026-06-29T23:50:00Z');
    const { thisHour, carriedOver } = partitionActiveByHour([a, b, c], futureKey);
    expect(thisHour).toEqual([]);
    expect(carriedOver.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
