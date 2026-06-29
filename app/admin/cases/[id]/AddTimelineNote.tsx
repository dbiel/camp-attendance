'use client';

import { useState } from 'react';

/** Free-text note/comment box appended to a case's timeline. The parent owns the
 * POST (via the page's logEvent('note', …)); this just collects + clears text. */
export function AddTimelineNote({ onSubmit }: { onSubmit: (body: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  async function submit() {
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setText('');
    } catch {
      setError('Could not add the note. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note or comment to the timeline…"
        className="h-16 w-full rounded border p-2 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !trimmed}
        className="mt-1 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add to timeline'}
      </button>
    </div>
  );
}
