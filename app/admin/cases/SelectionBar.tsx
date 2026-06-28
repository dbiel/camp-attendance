'use client';

import { useState } from 'react';

/**
 * Appears when ≥1 report is selected on the hub. Issues ONE combined staff link
 * for the selection. The server enforces same-building + a cap; this just sends
 * the ids and shows the resulting copyable URL.
 */
export function SelectionBar({
  caseIds,
  getAuthHeaders,
  onClear,
}: {
  caseIds: string[];
  getAuthHeaders: () => Promise<Record<string, string>>;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);

  if (caseIds.length === 0) return null;

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
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{caseIds.length} selected</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClear} className="camp-btn-outline px-3 py-1 text-sm">
            Clear
          </button>
          <button
            type="button"
            onClick={issue}
            disabled={busy}
            className="camp-btn-primary px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create combined link'}
          </button>
        </div>
      </div>
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
