'use client';

import { useState } from 'react';

/**
 * Appears when ≥1 report is selected on the hub. Two bulk actions on the
 * selection: RESOLVE them all (auto-logs a resolution on each), or issue ONE
 * combined staff link. The server enforces auth/building-bound/cap.
 */
export function SelectionBar({
  caseIds,
  getAuthHeaders,
  onClear,
  onResolved,
}: {
  caseIds: string[];
  getAuthHeaders: () => Promise<Record<string, string>>;
  onClear: () => void;
  /** Called after a bulk resolve so the hub refreshes + drops the selection. */
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [resolveNote, setResolveNote] = useState('Resolved');
  const [resolving, setResolving] = useState(false);

  if (caseIds.length === 0) return null;

  async function resolveSelected() {
    setResolving(true);
    setError(null);
    const note = resolveNote.trim() || 'Resolved';
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      // Resolve each in parallel; resolveCase auto-logs a 'resolved' event with
      // this note. Already-resolved ones return 409 and are counted as failures.
      const results = await Promise.all(
        caseIds.map((id) =>
          fetch(`/api/cases/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ resolution_note: note }),
          })
            .then((r) => r.ok)
            .catch(() => false)
        )
      );
      const ok = results.filter(Boolean).length;
      const failed = results.length - ok;
      setConfirmResolve(false);
      onResolved();
      if (failed > 0) {
        setError(`Resolved ${ok}. ${failed} could not be resolved (already resolved or no access).`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  async function issue() {
    setBusy(true);
    setError(null);
    setUrl(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/cases/share-combined', {
        method: 'POST',
        headers,
        body: JSON.stringify({ case_ids: caseIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `Could not create link (${res.status})`);
        return;
      }
      setUrl(`${window.location.origin}${body.url}`);
      setToken(body.token ?? null);
      setRevoked(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/cases/share-combined/${token}`, { method: 'DELETE', headers });
      if (!res.ok) {
        setError(`Could not revoke (${res.status})`);
        return;
      }
      setRevoked(true);
      setUrl(null);
      setToken(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed — select the link and copy manually.');
    }
  }

  return (
    <div className="sticky bottom-0 z-30 mt-3 rounded-lg border border-camp-green bg-[var(--card)] backdrop-blur-[12px] p-3 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{caseIds.length} selected</span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onClear} className="camp-btn-outline px-3 py-1 text-sm">
            Clear
          </button>
          <button
            type="button"
            onClick={() => setConfirmResolve((v) => !v)}
            disabled={resolving}
            className="rounded bg-green-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
          >
            ✓ Resolve selected
          </button>
          <button
            type="button"
            onClick={issue}
            disabled={busy}
            className="camp-btn-outline px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Combined link'}
          </button>
        </div>
      </div>

      {confirmResolve && (
        <div className="mt-2 rounded border border-green-600 bg-green-50 p-2">
          <label className="block text-xs font-medium text-green-900">
            Resolution note (logged on all {caseIds.length})
          </label>
          <input
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="e.g. All accounted for at lunch"
            className="mt-1 w-full rounded border p-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={resolveSelected}
              disabled={resolving}
              className="rounded bg-green-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
            >
              {resolving ? 'Resolving…' : `Confirm resolve ${caseIds.length}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmResolve(false)}
              className="camp-btn-outline px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {url && (
        <div className="mt-2 flex items-center gap-2">
          <input readOnly value={url} className="flex-1 rounded border p-2 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={copy} className="camp-btn-accent px-3 py-1 text-sm">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button type="button" onClick={revoke} disabled={busy} className="camp-btn-danger px-3 py-1 text-sm">
            Revoke
          </button>
        </div>
      )}
      {revoked && <p className="mt-2 text-sm text-[var(--text-2)]">Link revoked — it no longer works.</p>}
    </div>
  );
}
