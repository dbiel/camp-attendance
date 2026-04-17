'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';

interface AdminEntry {
  email: string;
  added_by: string;
  added_at: number;
}

function formatAddedAt(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminUsersSection() {
  const { user, getAuthHeaders } = useAuth();
  const { push: toast } = useToast();

  const [admins, setAdmins] = useState<AdminEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<AdminEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  const callerEmail = user?.email?.toLowerCase() ?? null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admins', { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body?.error || `Failed to load admins (${res.status})`);
        return;
      }
      setAdmins(body.admins as AdminEntry[]);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      toast({ kind: 'error', text: 'Enter a valid email address' });
      return;
    }
    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Add failed (${res.status})` });
        return;
      }
      toast({ kind: 'success', text: `Added ${email}` });
      setNewEmail('');
      await refresh();
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admins/${encodeURIComponent(removeTarget.email)}`,
        { method: 'DELETE', headers }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Remove failed (${res.status})` });
        return;
      }
      toast({ kind: 'success', text: `Removed ${removeTarget.email}` });
      setRemoveTarget(null);
      await refresh();
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="camp-card p-6">
      <h2 className="camp-subheading">Admin Users</h2>
      <p className="text-sm text-gray-500 mb-4">
        Only listed emails can sign in as admin. Any admin can add or remove
        others.
      </p>

      {loading && <div className="text-gray-600">Loading admins...</div>}
      {loadError && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
          {loadError}
        </div>
      )}

      {admins && admins.length === 0 && (
        <div className="text-gray-600 mb-4">No admins yet.</div>
      )}

      {admins && admins.length > 0 && (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded mb-4">
          {admins.map((a) => {
            const isSelf = callerEmail && a.email.toLowerCase() === callerEmail;
            return (
              <li
                key={a.email}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm flex items-center gap-2">
                    <span>{a.email}</span>
                    {isSelf && (
                      <span className="text-xs bg-camp-green text-white px-2 py-0.5 rounded">
                        you
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Added by {a.added_by} on {formatAddedAt(a.added_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="camp-btn-outline px-3 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setRemoveTarget(a)}
                  disabled={!!isSelf}
                  aria-label={`Remove ${a.email}`}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-3">
        <label htmlFor="new-admin-email" className="sr-only">
          New admin email
        </label>
        <input
          id="new-admin-email"
          type="email"
          required
          placeholder="name@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="camp-input flex-1 min-w-[220px]"
          disabled={adding}
        />
        <button
          type="submit"
          className="camp-btn-primary px-4"
          disabled={adding || !newEmail.trim()}
        >
          {adding ? 'Adding...' : 'Add Admin'}
        </button>
      </form>

      <Modal
        open={!!removeTarget}
        onClose={() => (removing ? undefined : setRemoveTarget(null))}
        title="Remove admin?"
        size="md"
      >
        <p className="text-sm text-gray-700 mb-6">
          Remove <strong>{removeTarget?.email}</strong> from the admin list?
          They&apos;ll lose access to the admin app the next time their
          session refreshes.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="camp-btn-outline px-4"
            onClick={() => setRemoveTarget(null)}
            disabled={removing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="camp-btn-accent px-4"
            onClick={handleRemoveConfirm}
            disabled={removing}
          >
            {removing ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
