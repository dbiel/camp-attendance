import { getRosterForToken } from './ensemble-attendance';
import { listCases, listCasesForStudent, listCaseEvents, addCaseEvent } from './cases';
import { getStudent } from './firestore';
import { toEnsembleIncidentProjection, type EnsembleIncidentProjection } from './projections';

/** First active case for a student, or null. */
async function activeCaseFor(studentId: string) {
  const cases = await listCasesForStudent(studentId);
  return cases.find((c) => c.status === 'active') ?? null;
}

/** Roster indices (refs) whose student has at least one active case. Scopes to
 * THIS ensemble's server-derived roster — a leaked token can only see its own
 * kids. Returns null for an invalid token. */
export async function listActiveIncidentRefs(token: string): Promise<number[] | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const idToRef = new Map<string, number>();
  rosterData.roster.forEach((s, i) => idToRef.set(s.id, i));
  const active = await listCases('active');
  const refs: number[] = [];
  for (const c of active) {
    const ref = idToRef.get(c.student_id);
    if (ref !== undefined) refs.push(ref);
  }
  return refs.sort((a, b) => a - b);
}

/** Scoped incident projection for the student at `ref`, or null (invalid token,
 * out-of-range ref, or no active case). */
export async function getEnsembleIncidentByRef(
  token: string,
  ref: number
): Promise<EnsembleIncidentProjection | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const student = rosterData.roster[ref];
  if (!student) return null;
  const c = await activeCaseFor(student.id);
  if (!c) return null;
  const [full, events] = await Promise.all([getStudent(student.id), listCaseEvents(c.id)]);
  return toEnsembleIncidentProjection(c, full ?? student, events);
}

/** Append a staff_update to the active case at `ref`, authored by the ensemble
 * label. Server re-derives the roster + case from the token — never trusts a
 * client id. */
export async function postEnsembleIncidentUpdate(
  token: string,
  ref: number,
  body: string
): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'gone' }> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return { ok: false, reason: 'invalid' };
  const student = rosterData.roster[ref];
  if (!student) return { ok: false, reason: 'invalid' };
  const c = await activeCaseFor(student.id);
  if (!c) return { ok: false, reason: 'gone' };
  await addCaseEvent(c.id, 'staff_update', body, rosterData.ensemble);
  return { ok: true };
}
