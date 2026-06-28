import { describe, it, expect } from 'vitest';
import { scoreRank, compareByScore, compareByLastName } from '@/lib/score-order';

describe('scoreRank', () => {
  it('ranks woodwinds before brass before percussion before strings', () => {
    expect(scoreRank('Flute')).toBeLessThan(scoreRank('Trumpet'));
    expect(scoreRank('Trumpet')).toBeLessThan(scoreRank('Percussion'));
    expect(scoreRank('Percussion')).toBeLessThan(scoreRank('Violin'));
  });

  it('matches common label variants to the same family', () => {
    expect(scoreRank('Bb Clarinet')).toBe(scoreRank('Clarinet'));
    expect(scoreRank('B-flat Clarinet')).toBe(scoreRank('Clarinet'));
  });

  it('picks the most specific family (bass clarinet ≠ clarinet, piccolo < flute)', () => {
    expect(scoreRank('Bass Clarinet')).not.toBe(scoreRank('Clarinet'));
    expect(scoreRank('Bass Clarinet')).toBeGreaterThan(scoreRank('Clarinet'));
    expect(scoreRank('Piccolo')).toBeLessThan(scoreRank('Flute'));
  });

  it('orders the sax family soprano→alto→tenor→bari', () => {
    expect(scoreRank('Soprano Sax')).toBeLessThan(scoreRank('Alto Sax'));
    expect(scoreRank('Alto Sax')).toBeLessThan(scoreRank('Tenor Sax'));
    expect(scoreRank('Tenor Sax')).toBeLessThan(scoreRank('Bari Sax'));
  });

  it('sends unknown/empty instruments to the back', () => {
    expect(scoreRank('Kazoo')).toBeGreaterThan(scoreRank('Tuba'));
    expect(scoreRank('')).toBeGreaterThan(scoreRank('Violin'));
  });
});

describe('compareByScore', () => {
  it('sorts by score order, then chair, then last name', () => {
    const roster = [
      { instrument: 'Trumpet', last_name: 'Zane', first_name: 'A', chair_number: 2 },
      { instrument: 'Flute', last_name: 'Young', first_name: 'B' },
      { instrument: 'Trumpet', last_name: 'Adams', first_name: 'C', chair_number: 1 },
    ];
    const sorted = [...roster].sort(compareByScore).map((r) => r.last_name);
    // Flute first (woodwind), then trumpets by chair (Adams ch1 before Zane ch2).
    expect(sorted).toEqual(['Young', 'Adams', 'Zane']);
  });
});

describe('compareByLastName', () => {
  it('sorts alphabetically by last then first name', () => {
    const roster = [
      { instrument: 'x', last_name: 'Brown', first_name: 'Zed' },
      { instrument: 'x', last_name: 'Brown', first_name: 'Amy' },
      { instrument: 'x', last_name: 'Adams', first_name: 'Bob' },
    ];
    const sorted = [...roster].sort(compareByLastName).map((r) => `${r.last_name},${r.first_name}`);
    expect(sorted).toEqual(['Adams,Bob', 'Brown,Amy', 'Brown,Zed']);
  });
});
