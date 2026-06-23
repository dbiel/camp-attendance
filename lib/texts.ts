/**
 * `texts` collection (iMessage ingest) — server-side data access.
 *
 * Super-admin-only. The Mac Mini watcher upserts incoming texts here keyed by
 * `message.guid` (idempotent replay-safe). The web app reads/mutates only via
 * GET/PATCH/DELETE /api/texts. No client ever touches this collection (rules
 * deny it), mirroring `cases`.
 */
import { adminDb } from './firebase-admin';
import type { TextDoc, TextTag } from './types';

const COLLECTION = 'texts';

/** Fields the watcher provides at ingest. `created_at` is stamped here. */
export type UpsertTextInput = Omit<TextDoc, 'id' | 'created_at' | 'escalated_case_id'> & {
  guid: string;
  escalated_case_id?: string | null;
  created_at?: string;
};

/**
 * Idempotent write keyed by `message.guid`: the doc id IS the guid, so a
 * cursor reset / replay overwrites the same doc instead of duplicating. We
 * preserve an existing `escalated_case_id` so a replay can't clobber a link
 * Plan C set after ingest.
 */
export async function upsertText(input: UpsertTextInput): Promise<string> {
  const { guid, created_at, escalated_case_id, ...rest } = input;
  const ref = adminDb.collection(COLLECTION).doc(guid);
  const existing = await ref.get();
  const prevEscalated = existing.exists
    ? ((existing.data() as TextDoc).escalated_case_id ?? null)
    : null;

  const doc: Omit<TextDoc, 'id'> = {
    ...rest,
    created_at: created_at ?? new Date().toISOString(),
    escalated_case_id: escalated_case_id ?? prevEscalated,
  };
  await ref.set(doc);
  return guid;
}

export async function listTexts(opts: { tag?: TextTag } = {}): Promise<TextDoc[]> {
  let query = adminDb.collection(COLLECTION).orderBy('sent_at', 'desc');
  if (opts.tag) {
    // where() before orderBy in the chain; the fake test client tolerates both.
    query = adminDb.collection(COLLECTION).where('tag', '==', opts.tag).orderBy('sent_at', 'desc');
  }
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TextDoc, 'id'>) }));
}

export async function getText(id: string): Promise<TextDoc | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as Omit<TextDoc, 'id'>) }) : null;
}

export async function retagText(id: string, tag: TextTag, reason: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).update({ tag, tag_reason: reason });
}

export async function dismissText(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).delete();
}

/** Called by Plan C when a text is escalated into a Report/case. */
export async function setTextEscalated(id: string, caseId: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).update({ escalated_case_id: caseId });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * purge_after = camp end + 30 days. If no camp end date is known, fall back to
 * sentAt + 90 days as a safety bound so texts never live forever.
 */
export function computePurgeAfter(campEndDate: string | null, sentAt: string): string {
  if (campEndDate) {
    // campEndDate is a YYYY-MM-DD calendar date.
    const base = new Date(`${campEndDate}T00:00:00.000Z`).getTime();
    return new Date(base + 30 * DAY_MS).toISOString();
  }
  return new Date(new Date(sentAt).getTime() + 90 * DAY_MS).toISOString();
}

/**
 * Deletes texts whose `purge_after` is in the past. Escalated texts (with an
 * `escalated_case_id`) are retained so evidence isn't lost while a linked
 * Report is open — Plan C is responsible for clearing them post-resolution.
 * Returns the number of docs deleted.
 */
export async function purgeExpiredTexts(now: Date = new Date()): Promise<number> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('purge_after', '<', now.toISOString())
    .get();
  let deleted = 0;
  for (const d of snap.docs) {
    const data = d.data() as TextDoc;
    if (data.escalated_case_id) continue; // skip-if-escalated
    await adminDb.collection(COLLECTION).doc(d.id).delete();
    deleted++;
  }
  return deleted;
}
