import { describe, it, expect, vi, beforeEach } from 'vitest';

const { docGetMock, docSetMock } = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: docGetMock, set: docSetMock }) }) },
}));

import { renderTemplate, smsHref, getMessageTemplates, DEFAULT_TEMPLATES } from '@/lib/messages';

describe('renderTemplate', () => {
  it('substitutes placeholders', () => {
    expect(renderTemplate('Hi {parent_first}, {kid_first} is fine.', { parent_first: 'Beth', kid_first: 'Johnny' }))
      .toBe('Hi Beth, Johnny is fine.');
  });
  it('renders unknown placeholders as empty', () => {
    expect(renderTemplate('Hi {nope}!', {})).toBe('Hi !');
  });
});

describe('smsHref', () => {
  it('builds an sms URI with encoded body', () => {
    expect(smsHref('+18065550101', 'Hi Beth & co')).toBe('sms:+18065550101?&body=Hi%20Beth%20%26%20co');
  });
});

describe('getMessageTemplates', () => {
  beforeEach(() => vi.clearAllMocks());
  it('falls back to defaults when doc is missing', async () => {
    docGetMock.mockResolvedValue({ exists: false });
    expect(await getMessageTemplates()).toEqual(DEFAULT_TEMPLATES);
  });
  it('merges stored values over defaults', async () => {
    docGetMock.mockResolvedValue({ exists: true, data: () => ({ parent: 'custom' }) });
    const t = await getMessageTemplates();
    expect(t.parent).toBe('custom');
    expect(t.dorm_staff).toBe(DEFAULT_TEMPLATES.dorm_staff);
  });
});
