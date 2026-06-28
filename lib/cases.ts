import { randomBytes } from 'node:crypto';
import { adminDb } from './firebase-admin';

export type CaseStatus = 'active' | 'resolved';

export type CaseEventType =
  | 'report_received'
  | 'parent_texted'
  | 'dorm_staff_texted'
  | 'note'
  | 'resolved'
  | 'reopened'
  | 'staff_update';

export type CaseSource = 'text' | 'ensemble_attendance' | 'manual';

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
  // ─── Denormalized student fields for at-a-glance hub cards (avoids N reads).
  dorm_building: string | null;
  dorm_room: string | null;
  instrument: string | null;
  division: string | null; // so the card can say "Commuter" only when KNOWN
  // ─── Time/grouping. occurred_at is ALWAYS set (defaults to created_at) so
  // client-side hour bucketing never drops a doc; the server orders by
  // created_at (existing index). Do NOT add a status+occurred_at index.
  occurred_at: string;
  day_key: string | null;
  // ─── Origin + which session/period (picker in Phase 3, attendance in Phase 6).
  // batch_id groups reports filed together from one multi-person paste.
  source: CaseSource;
  batch_id: string | null;
  session_id: string | null;
  period_id: string | null;
  period_number: number | null;
  // "No student found" — filed against a raw name with no roster match (e.g.
  // a misspelling). student_id is '' until David reconciles. Optional so
  // pre-existing docs (always matched) read fine.
  needs_match?: boolean;
  share_token: string;
  // ─── Two-way staff link (Plan C) — all nullable; Firestore rejects undefined.
  share_issued_at: string | null; // ISO; when the current token was issued
  share_expires_at: string | null; // ISO; issued + 4h
  share_revoked: boolean; // manual revoke kills the link immediately
  share_recipient_label: string | null; // who David sent it to (his tracking)
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
  // Optional enrichment — all default safely (occurred_at → created_at).
  dorm_building?: string | null;
  dorm_room?: string | null;
  instrument?: string | null;
  division?: string | null;
  occurred_at?: string | null;
  day_key?: string | null;
  source?: CaseSource;
  batch_id?: string | null;
  session_id?: string | null;
  period_id?: string | null;
  period_number?: number | null;
  needs_match?: boolean;
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
    dorm_building: input.dorm_building ?? null,
    dorm_room: input.dorm_room ?? null,
    instrument: input.instrument ?? null,
    division: input.division ?? null,
    occurred_at: input.occurred_at ?? now, // ALWAYS non-null
    day_key: input.day_key ?? null,
    source: input.source ?? 'text',
    batch_id: input.batch_id ?? null,
    session_id: input.session_id ?? null,
    period_id: input.period_id ?? null,
    period_number: input.period_number ?? null,
    needs_match: input.needs_match ?? false,
    share_token: randomBytes(16).toString('hex'),
    share_issued_at: null,
    share_expires_at: null,
    share_revoked: false,
    share_recipient_label: null,
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

// ─── Two-way staff share links (Plan C) ────────────────────────────────────
// Links are per-Report, time-boxed (4h), and revocable. Re-issuing rotates the
// token so the previous link dies immediately. The public viewer never touches
// Firestore directly — only the token-validating /api/r/* routes do, via these
// helpers and the Admin SDK.

const SHARE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface IssuedShareLink {
  token: string;
  url: string; // relative path, e.g. /r/<token>
  expires_at: string; // ISO
}

/**
 * Issues (or re-issues) a share link for a case. Rotates `share_token` to a new
 * random hex so any previously-issued link validates as invalid, and sets a
 * fresh 4h window. `recipientLabel` is free text for David's own tracking.
 */
export async function issueShareLink(
  caseId: string,
  recipientLabel: string | null,
  now: Date = new Date()
): Promise<IssuedShareLink> {
  const token = randomBytes(16).toString('hex');
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SHARE_TTL_MS).toISOString();
  await adminDb.collection(CASES).doc(caseId).update({
    share_token: token,
    share_issued_at: issuedAt,
    share_expires_at: expiresAt,
    share_revoked: false,
    share_recipient_label: recipientLabel ?? null,
  });
  return { token, url: `/r/${token}`, expires_at: expiresAt };
}

/** Manually revokes the active share link; the token immediately stops validating. */
export async function revokeShareLink(caseId: string): Promise<void> {
  await adminDb.collection(CASES).doc(caseId).update({ share_revoked: true });
}

/**
 * Resolves a share token to a case id, enforcing validity. Returns null when the
 * token is unknown, the link was never issued, has been revoked, or `now` is at
 * or past `share_expires_at`. Callers (the public /api/r/* routes) must return a
 * uniform failure for all null cases — no enumeration signal.
 */
export async function validateShareToken(
  token: string,
  now: Date = new Date()
): Promise<{ caseId: string } | null> {
  if (!token) return null;
  const snap = await adminDb.collection(CASES).where('share_token', '==', token).limit(1).get();
  if (snap.empty || snap.docs.length === 0) return null;
  const doc = snap.docs[0]!;
  const data = doc.data() as Omit<Case, 'id'>;
  if (data.share_revoked) return null;
  if (!data.share_expires_at) return null; // link was never issued
  if (now.getTime() >= new Date(data.share_expires_at).getTime()) return null;
  return { caseId: doc.id };
}

export async function listCaseEvents(caseId: string): Promise<CaseEvent[]> {
  const snap = await adminDb
    .collection(EVENTS)
    .where('case_id', '==', caseId)
    .orderBy('created_at', 'asc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CaseEvent, 'id'>) }));
}
