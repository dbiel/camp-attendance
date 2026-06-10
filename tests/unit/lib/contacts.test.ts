import { describe, it, expect, vi, beforeEach } from 'vitest';

const { addMock, getMock, whereGetMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  getMock: vi.fn(),
  whereGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      add: addMock,
      get: getMock,
      where: () => ({ limit: () => ({ get: whereGetMock }) }),
      orderBy: () => ({ get: getMock }),
    }),
  },
}));

import { normalizePhone, createContact, findContactByPhone, listContacts } from '@/lib/contacts';

describe('normalizePhone', () => {
  it('normalizes 10-digit US numbers', () => {
    expect(normalizePhone('806-928-3654')).toBe('+18069283654');
    expect(normalizePhone('(806) 928 3654')).toBe('+18069283654');
  });
  it('normalizes 11-digit numbers starting with 1', () => {
    expect(normalizePhone('1 806 928 3654')).toBe('+18069283654');
  });
  it('passes through E.164 untouched', () => {
    expect(normalizePhone('+18069283654')).toBe('+18069283654');
  });
  it('returns null for garbage', () => {
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('createContact', () => {
  beforeEach(() => vi.clearAllMocks());
  it('stores normalized phone and role', async () => {
    addMock.mockResolvedValue({ id: 'c1' });
    const id = await createContact({ name: 'Sarah Lee', role: 'dorm_staff', phone: '806.555.0101' });
    expect(id).toBe('c1');
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+18065550101', name: 'Sarah Lee', role: 'dorm_staff' })
    );
  });
  it('rejects an unnormalizable phone', async () => {
    await expect(createContact({ name: 'X', role: 'faculty', phone: 'nope' })).rejects.toThrow(/phone/i);
  });
});

describe('listContacts', () => {
  beforeEach(() => vi.clearAllMocks());
  it('maps docs to {id, ...data} ordered by name', async () => {
    getMock.mockResolvedValue({
      docs: [
        { id: 'c1', data: () => ({ name: 'Alice Adams', phone: '+18065550101', role: 'faculty', created_at: '2026-06-09T00:00:00.000Z' }) },
        { id: 'c2', data: () => ({ name: 'Sarah Lee', phone: '+18065550102', role: 'dorm_staff', created_at: '2026-06-09T00:00:00.000Z' }) },
      ],
    });
    const contacts = await listContacts();
    expect(contacts).toEqual([
      { id: 'c1', name: 'Alice Adams', phone: '+18065550101', role: 'faculty', created_at: '2026-06-09T00:00:00.000Z' },
      { id: 'c2', name: 'Sarah Lee', phone: '+18065550102', role: 'dorm_staff', created_at: '2026-06-09T00:00:00.000Z' },
    ]);
  });
});

describe('findContactByPhone', () => {
  beforeEach(() => vi.clearAllMocks());
  it('matches on the normalized form', async () => {
    whereGetMock.mockResolvedValue({
      empty: false,
      docs: [{ id: 'c1', data: () => ({ name: 'Sarah Lee', phone: '+18065550101', role: 'dorm_staff' }) }],
    });
    const c = await findContactByPhone('(806) 555-0101');
    expect(c?.id).toBe('c1');
  });
  it('returns null when nothing matches', async () => {
    whereGetMock.mockResolvedValue({ empty: true, docs: [] });
    expect(await findContactByPhone('806-555-9999')).toBeNull();
  });
});
