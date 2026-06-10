import { randomBytes } from 'node:crypto';
import { adminDb } from './firebase-admin';

export type CaseStatus = 'active' | 'resolved';

export type CaseEventType =
  | 'report_received'
  | 'parent_texted'
  | 'dorm_staff_texted'
  | 'note'
  | 'resolved'
  | 'reopened';

export interface Case {
  id: string;
  status: CaseStatus;
  student_id: string;
  student_name: string; // denormalized for list rendering
  reporter_contact_id: string | null;
  reporter_name: string | null;
  summary: string;
  raw_text: string; // original pasted report, always preserved
  session_label: string | null; // free text: where/when they were missed
  share_token: string;
  resolution_note: string | null;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  type: CaseEventType;
  body: string;
  actor: string; // admin email (Phase 2: share-link staff name)
  created_at: string;
}

const CASES = 'cases';
const EVENTS = 'case_events';

export interface CreateCaseInput {
  student_id: string;
  student_name: string;
  reporter_contact_id?: string | null;
  reporter_name?: string | null;
  summary: string;
  raw_text: string;
  session_label?: string | null;
  created_by: string;
}

export async function createCase(input: CreateCaseInput): Promise<string> {
  const now = new Date().toISOString();
  const doc: Omit<Case, 'id'> = {
    status: 'active',
    student_id: input.student_id,
    student_name: input.student_name,
    reporter_contact_id: input.reporter_contact_id ?? null,
    reporter_name: input.reporter_name ?? null,
    summary: input.summary,
    raw_text: input.raw_text,
    session_label: input.session_label ?? null,
    share_token: randomBytes(16).toString('hex'),
    resolution_note: null,
    created_by: input.created_by,
    created_at: now,
    resolved_at: null,
  };
  const ref = await adminDb.collection(CASES).add(doc);
  await addCaseEvent(ref.id, 'report_received', input.summary, input.created_by);
  return ref.id;
}

export async function getCase(id: string): Promise<Case | null> {
  const doc = await adminDb.collection(CASES).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as Omit<Case, 'id'>) }) : null;
}

export async function listCases(status: CaseStatus): Promise<Case[]> {
  const snap = await adminDb
    .collection(CASES)
    .where('status', '==', status)
    .orderBy('created_at', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Case, 'id'>) }));
}

export async function listCasesForStudent(studentId: string): Promise<Case[]> {
  const snap = await adminDb
    .collection(CASES)
    .where('student_id', '==', studentId)
    .orderBy('created_at', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Case, 'id'>) }));
}

export async function resolveCase(id: string, note: string, actor: string): Promise<void> {
  await adminDb.collection(CASES).doc(id).update({
    status: 'resolved',
    resolution_note: note,
    resolved_at: new Date().toISOString(),
  });
  await addCaseEvent(id, 'resolved', note, actor);
}

export async function addCaseEvent(
  caseId: string,
  type: CaseEventType,
  body: string,
  actor: string
): Promise<string> {
  const doc: Omit<CaseEvent, 'id'> = {
    case_id: caseId,
    type,
    body,
    actor,
    created_at: new Date().toISOString(),
  };
  const ref = await adminDb.collection(EVENTS).add(doc);
  return ref.id;
}

export async function listCaseEvents(caseId: string): Promise<CaseEvent[]> {
  const snap = await adminDb
    .collection(EVENTS)
    .where('case_id', '==', caseId)
    .orderBy('created_at', 'asc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CaseEvent, 'id'>) }));
}
