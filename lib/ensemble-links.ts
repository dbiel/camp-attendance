import { randomBytes } from 'crypto';
import { adminDb } from './firebase-admin';
import type { Student } from './types';

/**
 * Phase 6 — per-ensemble open attendance links. An ensemble manager opens
 * `/e/<token>` (no login, like the staff links), marks present/absent, and
 * submits; absences flow onto David's hub as incident reports.
 *
 * Tokens live in `ensemble_links` (doc id = token, server-only via rules). The
 * token is the credential; it's revocable. The roster for a link is ALWAYS
 * re-derived server-side from the link's `ensemble` — never trusted from the
 * client — so an anonymous submitter can only ever touch that ensemble's known
 * students (never free-form, never another ensemble).
 */

const ENSEMBLE_LINKS = 'ensemble_links';
const STUDENTS = 'students';

export interface EnsembleLink {
  token: string;
  ensemble: string;
  label: string | null; // free text (e.g. the manager's name) for David's tracking
  created_at: string;
  revoked: boolean;
}

export interface IssuedEnsembleLink {
  token: string;
  url: string; // relative, e.g. /e/<token>
  ensemble: string;
}

/** Issue a fresh open link for an ensemble. */
export async function issueEnsembleLink(
  ensemble: string,
  label: string | null,
  now: Date = new Date()
): Promise<IssuedEnsembleLink> {
  const token = randomBytes(16).toString('hex');
  await adminDb.collection(ENSEMBLE_LINKS).doc(token).set({
    ensemble,
    label: label ?? null,
    created_at: now.toISOString(),
    revoked: false,
  });
  return { token, url: `/e/${token}`, ensemble };
}

/** All issued links (for the admin management page). */
export async function listEnsembleLinks(): Promise<EnsembleLink[]> {
  const snap = await adminDb.collection(ENSEMBLE_LINKS).get();
  return snap.docs.map((d) => {
    const data = d.data() as Omit<EnsembleLink, 'token'>;
    return { token: d.id, ...data };
  });
}

/** Kill a link immediately (set merge so it no-ops if already gone). */
export async function revokeEnsembleLink(token: string): Promise<void> {
  await adminDb.collection(ENSEMBLE_LINKS).doc(token).set({ revoked: true }, { merge: true });
}

/** Resolve a token to its ensemble, enforcing validity. Uniform-null for
 * unknown/revoked so the public route can return a uniform 404 (no enumeration). */
export async function validateEnsembleToken(
  token: string
): Promise<{ ensemble: string; label: string | null } | null> {
  if (!token) return null;
  const doc = await adminDb.collection(ENSEMBLE_LINKS).doc(token).get();
  if (!doc.exists) return null;
  const d = doc.data() as { ensemble?: string; label?: string | null; revoked?: boolean };
  if (d.revoked || !d.ensemble) return null;
  return { ensemble: d.ensemble, label: d.label ?? null };
}

/** The roster for an ensemble: that ensemble's students (server-only source of
 * truth for who an anonymous submitter is allowed to mark). */
export async function getEnsembleRoster(ensemble: string): Promise<Student[]> {
  const snap = await adminDb.collection(STUDENTS).where('ensemble', '==', ensemble).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Student, 'id'>) }));
}

/** Distinct ensembles present in the roster, with student counts — drives the
 * admin "generate a link per ensemble" page. */
export async function listEnsembles(): Promise<{ ensemble: string; count: number }[]> {
  const snap = await adminDb.collection(STUDENTS).get();
  const counts = new Map<string, number>();
  for (const d of snap.docs) {
    const e = (d.data() as { ensemble?: string }).ensemble;
    if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ensemble, count]) => ({ ensemble, count }))
    .sort((a, b) => a.ensemble.localeCompare(b.ensemble));
}
