import { getRosterForToken } from './ensemble-attendance';
import { listCases, listCasesForStudent, listCaseEvents, addCaseEvent } from './cases';
import { getStudent } from './firestore';
import { getTodayDate, hourBucket } from './date';
import { toEnsembleIncidentProjection, type EnsembleIncidentProjection } from './projections';

/** Camp-tz calendar date ('YYYY-MM-DD') of an ISO instant. */
function campDate(iso: string): string {
  return hourBucket(iso).slice(0, 10);
}

/** First active case for a student, or null (used for posting updates). */
async function activeCaseFor(studentId: string) {
  const cases = await listCasesForStudent(studentId);
  return cases.find((c) => c.status === 'active') ?? null;
}

/** Most-recent case from TODAY (any status) for a student, or null.
 * listCasesForStudent is created_at desc, so the first today match is newest. */
async function mostRecentTodayCaseFor(studentId: string) {
  const today = getTodayDate();
  const cases = await listCasesForStudent(studentId);
  return cases.find((c) => campDate(c.occurred_at || c.created_at) === today) ?? null;
}

/** Roster indices (refs) whose student has a report from TODAY — active OR
 * resolved. Scopes to THIS ensemble's server-derived roster (a leaked token
 * sees only its own kids). Returns null for an invalid token. */
export async function listTodayReportRefs(token: string): Promise<number[] | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const idToRef = new Map<string, number>();
  rosterData.roster.forEach((s, i) => idToRef.set(s.id, i));
  const today = getTodayDate();
  const [active, resolved] = await Promise.all([listCases('active'), listCases('resolved')]);
  const refs = new Set<number>();
  for (const c of [...active, ...resolved]) {
    if (campDate(c.occurred_at || c.created_at) !== today) continue;
    const ref = idToRef.get(c.student_id);
    if (ref !== undefined) refs.add(ref);
  }
  return [...refs].sort((a, b) => a - b);
}

/** Scoped projection of the most-recent TODAY report (any status) for the
 * student at `ref`, or null (invalid token, out-of-range ref, no today case). */
export async function getEnsembleReportByRef(
  token: string,
  ref: number
): Promise<EnsembleIncidentProjection | null> {
  const rosterData = await getRosterForToken(token);
  if (!rosterData) return null;
  const student = rosterData.roster[ref];
  if (!student) return null;
  const c = await mostRecentTodayCaseFor(student.id);
  if (!c) return null;
  const [full, events] = await Promise.all([getStudent(student.id), listCaseEvents(c.id)]);
  return toEnsembleIncidentProjection(c, full ?? student, events);
}

/** Append a staff_update to the ACTIVE case at `ref`, authored by the ensemble
 * label. Server re-derives roster + case from the token — never trusts a client
 * id. Unchanged: the manager's typed "update" still posts to the active case. */
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
