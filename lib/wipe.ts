import { adminDb } from './firebase-admin';
import { countDocs } from './firestore';

/**
 * Collections the Clear-All-Data button wipes for a fresh new-year load.
 *
 * Hard-coded — NEVER derived from a request parameter. Deliberately EXCLUDES:
 *   - `config`  (camp code / dates — wiping strands the app)
 *   - `admins`  (allowlist — wiping locks everyone out)
 *   - `texts`   (David's iMessage test data + live ingest)
 *   - `contacts`, `attendance`, `ingest_state`
 */
export const WIPE_COLLECTIONS = [
  'students',
  'faculty',
  'sessions',
  'periods',
  'session_students',
  'cases',
  'case_events',
  'staff_links',
] as const;

export interface WipeResult {
  collection: string;
  remaining: number;
}

/**
 * Delete every doc in each WIPE_COLLECTIONS collection, then verify each is
 * empty. Uses `recursiveDelete` (streamed BulkWriter) so the 256MB SSR fn
 * never loads a whole collection (session_students is ~12k docs) into memory.
 * Throws if any collection still has docs after the wipe (caller surfaces 500).
 * Idempotent / re-runnable.
 */
export async function wipeAllCampData(): Promise<WipeResult[]> {
  for (const name of WIPE_COLLECTIONS) {
    await adminDb.recursiveDelete(adminDb.collection(name));
  }

  const results: WipeResult[] = [];
  for (const name of WIPE_COLLECTIONS) {
    results.push({ collection: name, remaining: await countDocs(name) });
  }

  const leftover = results.filter((r) => r.remaining > 0);
  if (leftover.length) {
    throw new Error(
      `Wipe incomplete: ${leftover.map((r) => `${r.collection}(${r.remaining})`).join(', ')}`
    );
  }
  return results;
}
