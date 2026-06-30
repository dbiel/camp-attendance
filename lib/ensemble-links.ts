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

/** Ensembles offered by the shared picker link. Jazz is intentionally excluded.
 * Single source of truth for the fixed list (stored names, verbatim). */
export const PICKER_ENSEMBLES = [
  'Band 1', 'Band 2', 'Band 3', 'Band 4',
  'Band 5 HS/MS', 'Band 6 MS', 'Band 7 MS',
  'Orchestra 1', 'Orchestra 2', 'Orchestra 3',
] as const;

export interface SelectorLink {
  token: string;
  allowed: string[];
  label: string | null;
  created_at: string;
  revoked: boolean;
}

export interface PickerItem {
  ensemble: string;
  token: string; // the current per-ensemble /e/<token> to deep-link to
  count: number;
}

/** All issued per-ensemble links (for the admin management page). Selector docs
 * are excluded — they live in the same collection but aren't attendance links. */
export async function listEnsembleLinks(): Promise<EnsembleLink[]> {
  const snap = await adminDb.collection(ENSEMBLE_LINKS).get();
  return snap.docs
    .map((d) => ({ token: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((d) => typeof (d as { ensemble?: unknown }).ensemble === 'string' && (d as { kind?: string }).kind !== 'selector')
    .map((d) => {
      const x = d as EnsembleLink & { kind?: string };
      return { token: x.token, ensemble: x.ensemble, label: x.label ?? null, created_at: x.created_at, revoked: Boolean(x.revoked) };
    });
}

/** Most-recently-created non-revoked per-ensemble link for `ensemble`, or null. */
export function pickCurrentEnsembleLink(
  links: EnsembleLink[],
  ensemble: string
): EnsembleLink | null {
  const live = links.filter((l) => l.ensemble === ensemble && !l.revoked);
  if (live.length === 0) return null;
  return live.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}

/** Build picker items for `allowed`, resolving each to its current live link +
 * roster count. Ensembles with no live link are omitted (defensive). */
export function buildPickerItems(
  allowed: string[],
  links: EnsembleLink[],
  countByEnsemble: Map<string, number>
): PickerItem[] {
  const items: PickerItem[] = [];
  for (const ensemble of allowed) {
    const link = pickCurrentEnsembleLink(links, ensemble);
    if (!link) continue;
    items.push({ ensemble, token: link.token, count: countByEnsemble.get(ensemble) ?? 0 });
  }
  return items;
}

/** Selector links only (the shared picker credentials). */
export async function listSelectorLinks(): Promise<SelectorLink[]> {
  const snap = await adminDb.collection(ENSEMBLE_LINKS).get();
  return snap.docs
    .map((d) => ({ token: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((d) => (d as { kind?: string }).kind === 'selector')
    .map((d) => {
      const x = d as { token: string; allowed?: string[]; label?: string | null; created_at?: string; revoked?: boolean };
      return {
        token: x.token,
        allowed: Array.isArray(x.allowed) ? x.allowed : [],
        label: x.label ?? null,
        created_at: x.created_at ?? '',
        revoked: Boolean(x.revoked),
      };
    });
}

/** Resolve a selector token to its allowed ensembles, enforcing validity.
 * Uniform-null for unknown/revoked/non-selector. */
export async function validateSelectorToken(
  token: string
): Promise<{ allowed: string[]; label: string | null } | null> {
  if (!token) return null;
  const doc = await adminDb.collection(ENSEMBLE_LINKS).doc(token).get();
  if (!doc.exists) return null;
  const d = doc.data() as { kind?: string; allowed?: string[]; label?: string | null; revoked?: boolean };
  if (d.kind !== 'selector' || d.revoked || !Array.isArray(d.allowed)) return null;
  return { allowed: d.allowed, label: d.label ?? null };
}

/** Create a shared picker link. Ensures every offered ensemble has a live
 * per-ensemble link (reuse latest, else issue), then writes the selector doc. */
export async function issueSelectorLink(
  label: string | null,
  now: Date = new Date()
): Promise<{ token: string; url: string }> {
  const existing = await listEnsembleLinks();
  for (const ensemble of PICKER_ENSEMBLES) {
    if (!pickCurrentEnsembleLink(existing, ensemble)) {
      await issueEnsembleLink(ensemble, null, now);
    }
  }
  const token = randomBytes(16).toString('hex');
  await adminDb.collection(ENSEMBLE_LINKS).doc(token).set({
    kind: 'selector',
    allowed: [...PICKER_ENSEMBLES],
    label: label ?? null,
    created_at: now.toISOString(),
    revoked: false,
  });
  return { token, url: `/e/pick/${token}` };
}

/** Validate a selector token and resolve its picker items, or null. */
export async function resolvePickerTargets(token: string): Promise<PickerItem[] | null> {
  const v = await validateSelectorToken(token);
  if (!v) return null;
  const [links, ensembles] = await Promise.all([listEnsembleLinks(), listEnsembles()]);
  const countBy = new Map(ensembles.map((e) => [e.ensemble, e.count]));
  return buildPickerItems(v.allowed, links, countBy);
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
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Student, 'id'>) }))
    .filter((s) => !s.withdrawn); // removed-from-camp students drop off the roster
}

/** Distinct ensembles present in the roster, with student counts — drives the
 * admin "generate a link per ensemble" page. */
export async function listEnsembles(): Promise<{ ensemble: string; count: number }[]> {
  const snap = await adminDb.collection(STUDENTS).get();
  const counts = new Map<string, number>();
  for (const d of snap.docs) {
    const data = d.data() as { ensemble?: string; withdrawn?: boolean };
    if (data.withdrawn) continue; // removed-from-camp students don't count
    const e = data.ensemble;
    if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ensemble, count]) => ({ ensemble, count }))
    .sort((a, b) => a.ensemble.localeCompare(b.ensemble));
}
