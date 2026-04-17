/**
 * Offline attendance queue — localStorage-backed FIFO with dedupe.
 *
 * Teachers mark attendance on phones that may temporarily lose wifi. This queue
 * buffers writes locally so the UI stays responsive, and `flush()` drains to the
 * server when connectivity returns. Dedupe key `(student_id, session_id, date)`
 * means repeated toggles for the same student/session/day collapse to the latest
 * status — the server only ever needs the final intent.
 */

export type AttendanceStatus = 'present' | 'absent' | 'tardy';

export interface AttendanceQueueItem {
  student_id: string;
  session_id: string;
  date: string;
  status: AttendanceStatus;
  queuedAt: number;
}

export const QUEUE_KEY = 'attendance.queue.v1';

function dedupeKey(item: AttendanceQueueItem): string {
  return `${item.student_id}|${item.session_id}|${item.date}`;
}

function read(): AttendanceQueueItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AttendanceQueueItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: AttendanceQueueItem[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function enqueue(item: AttendanceQueueItem): void {
  const key = dedupeKey(item);
  const next = read().filter((i) => dedupeKey(i) !== key);
  next.push(item);
  write(next);
}

export function peek(): AttendanceQueueItem | undefined {
  return read()[0];
}

export function size(): number {
  return read().length;
}

export function clear(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(QUEUE_KEY);
}

export async function flush(
  send: (item: AttendanceQueueItem) => Promise<boolean>
): Promise<void> {
  // Drain FIFO; stop on first failure so caller can retry later with queue intact.
  while (true) {
    const items = read();
    if (items.length === 0) return;
    const head = items[0];
    const ok = await send(head);
    if (!ok) return;
    // Re-read in case enqueue happened mid-flight; remove only the matching head.
    const after = read();
    if (after.length > 0 && dedupeKey(after[0]) === dedupeKey(head)) {
      write(after.slice(1));
    } else {
      // Head changed (e.g. dedupe replaced it) — nothing to remove, move on.
      // Guard against infinite loops by breaking if no progress can be made.
      return;
    }
  }
}
