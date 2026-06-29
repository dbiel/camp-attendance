'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface EnsembleLink {
  token: string;
  ensemble: string;
  label: string | null;
  created_at: string;
  revoked: boolean;
}

interface EnsembleInfo {
  ensemble: string;
  count: number;
}

interface SelectorLink {
  token: string;
  allowed: string[];
  label: string | null;
  created_at: string;
  revoked: boolean;
}

/**
 * Super-admin tool to generate per-ensemble open attendance links. Each link
 * opens `/e/<token>` (no login) for an ensemble manager to mark present/absent;
 * absences flow onto the Incident hub. Links are copyable and revocable.
 */
export function EnsembleLinksSection() {
  const { getAuthHeaders } = useAuth();
  const [ensembles, setEnsembles] = useState<EnsembleInfo[]>([]);
  const [links, setLinks] = useState<EnsembleLink[]>([]);
  const [selectorLinks, setSelectorLinks] = useState<SelectorLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/ensemble-links', { headers });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as { ensembles: EnsembleInfo[]; links: EnsembleLink[]; selectorLinks?: SelectorLink[] };
      setEnsembles(data.ensembles ?? []);
      setLinks(data.links ?? []);
      setSelectorLinks(data.selectorLinks ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function generate(ensemble: string) {
    setBusy(ensemble);
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/ensemble-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ensemble }),
      });
      if (!res.ok) {
        setError(`Could not generate link (${res.status})`);
        return;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generatePicker() {
    setBusy('__picker__');
    setError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/ensemble-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'selector' }),
      });
      if (!res.ok) {
        setError(`Could not create picker link (${res.status})`);
        return;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function revoke(token: string) {
    setBusy(token);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/ensemble-links/${token}`, { method: 'DELETE', headers });
      if (!res.ok) {
        setError(`Could not revoke (${res.status})`);
        return;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy(token: string, path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
    } catch {
      setError('Copy failed — select the link manually.');
    }
  }

  const activeByEnsemble = (ensemble: string) =>
    links.filter((l) => l.ensemble === ensemble && !l.revoked);

  return (
    <section className="camp-card p-6">
      <h2 className="camp-subheading">Ensemble Attendance Links</h2>
      <p className="mb-4 text-sm text-gray-600">
        Generate an open link per ensemble for managers to take attendance on their phones. Absences
        post to the Incident hub automatically. Anyone with a link can mark attendance — revoke if one
        leaks.
      </p>

      <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--glass-border)] p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--text)]">Shared picker link</span>
          <button
            type="button"
            onClick={generatePicker}
            disabled={busy === '__picker__'}
            className="camp-btn-outline px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy === '__picker__' ? 'Creating…' : '+ New picker link'}
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          One link for all ensembles (Bands 1–7, Orchestra 1–3). Whoever has it picks an ensemble, then
          takes attendance. Revoke to disable.
        </p>
        {selectorLinks.filter((s) => !s.revoked).length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">
            {selectorLinks
              .filter((s) => !s.revoked)
              .map((s) => (
                <li key={s.token} className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/e/pick/${s.token}`}
                    onFocus={(ev) => ev.currentTarget.select()}
                    className="flex-1 rounded border border-[var(--glass-border)] bg-[var(--surface)] p-1 text-xs"
                  />
                  <button onClick={() => copy(s.token, `/e/pick/${s.token}`)} className="camp-btn-accent px-2 py-1 text-xs">
                    {copied === s.token ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => revoke(s.token)}
                    disabled={busy === s.token}
                    className="camp-btn-danger px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading ensembles…</p>}
      {!loading && ensembles.length === 0 && (
        <p className="text-sm text-gray-500">No ensembles in the roster yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {ensembles.map((e) => {
          const active = activeByEnsemble(e.ensemble);
          return (
            <div key={e.ensemble} className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text)]">
                  {e.ensemble} <span className="text-xs text-[var(--text-3)]">({e.count})</span>
                </span>
                <button
                  type="button"
                  onClick={() => generate(e.ensemble)}
                  disabled={busy === e.ensemble}
                  className="camp-btn-outline px-3 py-1 text-sm disabled:opacity-50"
                >
                  {busy === e.ensemble ? 'Generating…' : '+ New link'}
                </button>
              </div>
              {active.length > 0 && (
                <ul className="mt-2 flex flex-col gap-2">
                  {active.map((l) => (
                    <li key={l.token} className="flex items-center gap-2">
                      <input
                        readOnly
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/e/${l.token}`}
                        onFocus={(ev) => ev.currentTarget.select()}
                        className="flex-1 rounded border border-[var(--glass-border)] bg-[var(--surface)] p-1 text-xs"
                      />
                      <button onClick={() => copy(l.token, `/e/${l.token}`)} className="camp-btn-accent px-2 py-1 text-xs">
                        {copied === l.token ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        onClick={() => revoke(l.token)}
                        disabled={busy === l.token}
                        className="camp-btn-danger px-2 py-1 text-xs disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
