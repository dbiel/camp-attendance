import { adminDb } from './firebase-admin';

export type ContactRole = 'faculty' | 'dorm_staff' | 'admin' | 'other';

export interface Contact {
  id: string;
  name: string;
  role: ContactRole;
  phone: string; // E.164
  dorm_building?: string;
  notes?: string;
  created_at: string;
}

const COLLECTION = 'contacts';

/** Normalize a US phone number to E.164. Returns null if it can't be. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+1\d{10}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function createContact(input: {
  name: string;
  role: ContactRole;
  phone: string;
  dorm_building?: string;
  notes?: string;
}): Promise<string> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error('Invalid phone number');
  const doc: Omit<Contact, 'id'> = {
    name: input.name.trim(),
    role: input.role,
    phone,
    ...(input.dorm_building?.trim() ? { dorm_building: input.dorm_building.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    created_at: new Date().toISOString(),
  };
  const ref = await adminDb.collection(COLLECTION).add(doc);
  return ref.id;
}

export async function listContacts(): Promise<Contact[]> {
  const snap = await adminDb.collection(COLLECTION).orderBy('name').get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) }));
}

export async function findContactByPhone(raw: string): Promise<Contact | null> {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const snap = await adminDb.collection(COLLECTION).where('phone', '==', phone).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<Contact, 'id'>) };
}
