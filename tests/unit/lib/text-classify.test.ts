import { describe, it, expect } from 'vitest';
import { classifyText } from '@/lib/text-classify';

describe('classifyText', () => {
  it('tags camp when the sender is a known faculty contact', () => {
    const r = classifyText({ body: 'hey what time is lunch', senderContactRole: 'faculty' });
    expect(r.tag).toBe('camp');
    expect(r.reason).toMatch(/known camp contact/i);
  });

  it('tags camp for dorm_staff and admin contact roles too', () => {
    expect(classifyText({ body: 'x', senderContactRole: 'dorm_staff' }).tag).toBe('camp');
    expect(classifyText({ body: 'x', senderContactRole: 'admin' }).tag).toBe('camp');
  });

  it('does NOT auto-camp for an "other" contact role on its own', () => {
    const r = classifyText({ body: 'see you saturday', senderContactRole: 'other' });
    expect(r.tag).toBe('personal');
  });

  it('tags camp when the body contains a keyword and names it in the reason', () => {
    const r = classifyText({ body: 'My daughter feels sick today' });
    expect(r.tag).toBe('camp');
    expect(r.reason.toLowerCase()).toContain('sick');
  });

  it('tags camp when the body contains a roster student name', () => {
    const r = classifyText({
      body: 'Have you seen Tyler around?',
      rosterNames: ['Tyler', 'Morgan'],
    });
    expect(r.tag).toBe('camp');
    expect(r.reason.toLowerCase()).toContain('tyler');
  });

  it('tags camp when the body contains a dorm building name', () => {
    const r = classifyText({
      body: 'kid is back in Murdough now',
      dormNames: ['Murdough', 'Wall'],
    });
    expect(r.tag).toBe('camp');
    expect(r.reason.toLowerCase()).toContain('murdough');
  });

  it('tags camp when the body contains an instrument term', () => {
    const r = classifyText({ body: 'forgot my clarinet reeds' });
    expect(r.tag).toBe('camp');
    expect(r.reason.toLowerCase()).toContain('clarinet');
  });

  it('matches keywords case-insensitively and on word boundaries', () => {
    expect(classifyText({ body: 'NURSE needs to see them' }).tag).toBe('camp');
    // "scamp" must not match "camp"; "roomie" must not match "room"
    const r = classifyText({ body: 'what a scamp my roomie is' });
    expect(r.tag).toBe('personal');
  });

  it('ignores roster names shorter than 3 chars (single-letter preferred names)', () => {
    const r = classifyText({ body: 'g whiz that was great', rosterNames: ['G', 'Jo'] });
    expect(r.tag).toBe('personal');
  });

  it('still matches a 3+ char roster name', () => {
    const r = classifyText({ body: 'is Ana coming', rosterNames: ['Ana'] });
    expect(r.tag).toBe('camp');
  });

  it('tags personal when there is a body but no signal', () => {
    const r = classifyText({ body: 'happy birthday! love you' });
    expect(r.tag).toBe('personal');
    expect(r.reason).toBeTruthy();
  });

  it('tags unknown for an empty body from an unknown sender', () => {
    const r = classifyText({ body: '' });
    expect(r.tag).toBe('unknown');
    expect(r.reason).toBeTruthy();
  });

  it('whitespace-only body from an unknown sender is unknown', () => {
    const r = classifyText({ body: '   ' });
    expect(r.tag).toBe('unknown');
  });

  it('empty body but known camp contact is still camp', () => {
    const r = classifyText({ body: '', senderContactRole: 'faculty' });
    expect(r.tag).toBe('camp');
  });
});
