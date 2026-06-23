import { describe, it, expect } from 'vitest';
import { classifyText } from './classify.js';

describe('watcher classifyText (mirror of lib/text-classify.ts)', () => {
  it('known camp contact -> camp', () => {
    expect(classifyText({ body: 'hi', senderContactRole: 'faculty' }).tag).toBe('camp');
    expect(classifyText({ body: 'hi', senderContactRole: 'dorm_staff' }).tag).toBe('camp');
  });

  it('keyword hit -> camp with reason', () => {
    const r = classifyText({ body: 'kid is sick' });
    expect(r.tag).toBe('camp');
    expect(r.reason).toContain('sick');
  });

  it('instrument hit -> camp', () => {
    expect(classifyText({ body: 'left the trombone' }).tag).toBe('camp');
  });

  it('roster name -> camp', () => {
    expect(classifyText({ body: 'where is Tyler', rosterNames: ['Tyler'] }).tag).toBe('camp');
  });

  it('word boundaries: scamp/roomie do not match', () => {
    expect(classifyText({ body: 'what a scamp my roomie is' }).tag).toBe('personal');
  });

  it('no signal -> personal', () => {
    expect(classifyText({ body: 'love you' }).tag).toBe('personal');
  });

  it('empty body, unknown sender -> unknown', () => {
    expect(classifyText({ body: '' }).tag).toBe('unknown');
  });
});
