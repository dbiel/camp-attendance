'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';

type AdminRole = 'super_admin' | 'lookup_admin' | 'unknown';
type AuthType = 'google' | 'password';

interface AdminEntry {
  email: string;
  added_by: string;
  added_at: number;
  role: AdminRole;
  auth_type: AuthType;
  name?: string;
}

function formatAddedAt(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  lookup_admin: 'Lookup admin',
  unknown: 'Unknown',
};

export function AdminUsersSection() {
  const { user, getAuthHeaders } = useAuth();
  const { push: toast } = useToast();

  const [admins, setAdmins] = useState<AdminEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Add form
  const [accountType, setAccountType] = useState<AuthType>('google');
  const [newRole, setNewRole] = useState<'super_admin' | 'lookup_admin'>('lookup_admin');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [pwMode, setPwMode] = useState<'temp_password' | 'setup_link'>('setup_link');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<AdminEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  const [resetTarget, setResetTarget] = useState<AdminEntry | null>(null);
  const [setupLink, setSetupLink] = useState<string | null>(null);

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
    if (accountType === 'google') {
      const email = newEmail.trim().toLowerCase();
      if (!EMAIL_REGEX.test(email)) {
        toast({ kind: 'error', text: 'Enter a valid Google email address' });
        return;
      }
    } else {
      if (!newName.trim()) {
        toast({ kind: 'error', text: 'Enter a name for the password account' });
        return;
      }
      if (pwMode === 'temp_password' && newPassword.length < 8) {
        toast({ kind: 'error', text: 'Temp password must be at least 8 characters' });
        return;
      }
    }

    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const payload =
        accountType === 'google'
          ? { auth_type: 'google', role: newRole, email: newEmail.trim().toLowerCase() }
          : {
              auth_type: 'password',
              role: newRole,
              name: newName.trim(),
              mode: pwMode,
              ...(pwMode === 'temp_password' ? { password: newPassword } : {}),
              ...(newEmail.trim() ? { email: newEmail.trim().toLowerCase() } : {}),
            };
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Add failed (${res.status})` });
        return;
      }
      toast({ kind: 'success', text: `Added ${body.email}` });
      if (body.setup_link) setSetupLink(body.setup_link);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      await refresh();
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(a: AdminEntry, role: 'super_admin' | 'lookup_admin') {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admins/${encodeURIComponent(a.email)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Role change failed (${res.status})` });
        return;
      }
      toast({ kind: 'success', text: `${a.email} is now ${ROLE_LABEL[role]}` });
      await refresh();
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    }
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admins/${encodeURIComponent(removeTarget.email)}`, {
        method: 'DELETE',
        headers,
      });
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
      <p className="text-sm text-[var(--text-3)] mb-4">
        Super admins see everything and manage admins. Lookup admins can look up
        and edit camper data and view reports, but can&apos;t see texts, escalate,
        or change settings. People with a Google email just need their address
        added; people without one get a password account.
      </p>

      {loading && <div className="text-[var(--text-2)]">Loading admins...</div>}
      {loadError && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
          {loadError}
        </div>
      )}

      {admins && admins.length === 0 && (
        <div className="text-[var(--text-2)] mb-4">No admins yet.</div>
      )}

      {admins && admins.length > 0 && (
        <ul className="divide-y divide-[var(--glass-border)] border border-[var(--glass-border)] rounded mb-4">
          {admins.map((a) => {
            const isSelf = !!callerEmail && a.email.toLowerCase() === callerEmail;
            return (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm flex items-center gap-2 flex-wrap">
                    <span>{a.name ? `${a.name} · ${a.email}` : a.email}</span>
                    {isSelf && (
                      <span className="text-xs bg-camp-green text-white px-2 py-0.5 rounded">you</span>
                    )}
                    <span className="text-xs bg-[var(--surface)] text-[var(--text-2)] px-2 py-0.5 rounded">
                      {a.auth_type === 'password' ? 'password' : 'Google'}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-3)] mt-1">
                    Added by {a.added_by} on {formatAddedAt(a.added_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${a.email}`}>
                    Role for {a.email}
                  </label>
                  <select
                    id={`role-${a.email}`}
                    className="camp-input text-sm py-1"
                    value={a.role === 'unknown' ? 'lookup_admin' : a.role}
                    onChange={(e) =>
                      handleRoleChange(a, e.target.value as 'super_admin' | 'lookup_admin')
                    }
                  >
                    <option value="lookup_admin">Lookup admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                  {a.auth_type === 'password' && (
                    <button
                      type="button"
                      className="camp-btn-outline px-3 py-1 text-sm"
                      onClick={() => setResetTarget(a)}
                    >
                      Reset password
                    </button>
                  )}
                  <button
                    type="button"
                    className="camp-btn-outline px-3 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => setRemoveTarget(a)}
                    disabled={isSelf}
                    aria-label={`Remove ${a.email}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-3 border-t border-[var(--glass-border)] pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="account-type" className="text-sm font-medium">
            Account type
          </label>
          <select
            id="account-type"
            className="camp-input py-1 text-sm"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as AuthType)}
          >
            <option value="google">Google sign-in (has Gmail/Workspace email)</option>
            <option value="password">Password (no Google account)</option>
          </select>
          <label htmlFor="new-role" className="text-sm font-medium">
            Role
          </label>
          <select
            id="new-role"
            className="camp-input py-1 text-sm"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'super_admin' | 'lookup_admin')}
          >
            <option value="lookup_admin">Lookup admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>

        {accountType === 'google' ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="email"
              required
              placeholder="name@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="camp-input flex-1 min-w-[220px]"
              disabled={adding}
              aria-label="New admin Google email"
            />
            <button type="submit" className="camp-btn-primary px-4" disabled={adding || !newEmail.trim()}>
              {adding ? 'Adding...' : 'Add admin'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                required
                placeholder="Full name (e.g. Jane Smith)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="camp-input flex-1 min-w-[200px]"
                disabled={adding}
                aria-label="Name"
              />
              <input
                type="email"
                placeholder="Email (optional — leave blank to auto-generate a login)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="camp-input flex-1 min-w-[200px]"
                disabled={adding}
                aria-label="Optional email"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="pw-mode" className="text-sm font-medium">
                Setup
              </label>
              <select
                id="pw-mode"
                className="camp-input py-1 text-sm"
                value={pwMode}
                onChange={(e) => setPwMode(e.target.value as 'temp_password' | 'setup_link')}
              >
                <option value="setup_link">Generate a setup link (they set their own password)</option>
                <option value="temp_password">Set a temp password now (you hand it over)</option>
              </select>
              {pwMode === 'temp_password' && (
                <input
                  type="text"
                  placeholder="Temp password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="camp-input min-w-[200px]"
                  disabled={adding}
                  aria-label="Temp password"
                />
              )}
              <button type="submit" className="camp-btn-primary px-4" disabled={adding || !newName.trim()}>
                {adding ? 'Creating...' : 'Create account'}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Remove confirmation */}
      <Modal
        open={!!removeTarget}
        onClose={() => (removing ? undefined : setRemoveTarget(null))}
        title="Remove admin?"
        size="md"
      >
        <p className="text-sm text-[var(--text-2)] mb-6">
          Remove <strong>{removeTarget?.email}</strong> from the admin list? They&apos;ll lose
          access the next time their session refreshes.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" className="camp-btn-outline px-4" onClick={() => setRemoveTarget(null)} disabled={removing}>
            Cancel
          </button>
          <button type="button" className="camp-btn-accent px-4" onClick={handleRemoveConfirm} disabled={removing}>
            {removing ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </Modal>

      {/* Reset password */}
      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onLink={(link) => {
          setResetTarget(null);
          setSetupLink(link);
        }}
        getAuthHeaders={getAuthHeaders}
        toast={toast}
      />

      {/* Setup link result */}
      <Modal open={!!setupLink} onClose={() => setSetupLink(null)} title="Setup link" size="md">
        <p className="text-sm text-[var(--text-2)] mb-3">
          Send this link to the person. It lets them set their own password. Anyone with the link
          can set the password, so share it directly.
        </p>
        <div className="flex items-center gap-2">
          <input readOnly value={setupLink ?? ''} className="camp-input flex-1 font-mono text-xs" />
          <button
            type="button"
            className="camp-btn-outline px-3 py-1 text-sm"
            onClick={() => {
              if (setupLink) {
                void navigator.clipboard?.writeText(setupLink);
                toast({ kind: 'success', text: 'Copied' });
              }
            }}
          >
            Copy
          </button>
        </div>
      </Modal>
    </section>
  );
}

function ResetPasswordModal({
  target,
  onClose,
  onLink,
  getAuthHeaders,
  toast,
}: {
  target: AdminEntry | null;
  onClose: () => void;
  onLink: (link: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  toast: (t: { kind: 'success' | 'error'; text: string }) => void;
}) {
  const [mode, setMode] = useState<'setup_link' | 'temp_password'>('setup_link');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target) return;
    if (mode === 'temp_password' && password.length < 8) {
      toast({ kind: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admins/${encodeURIComponent(target.email)}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ mode, ...(mode === 'temp_password' ? { password } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Reset failed (${res.status})` });
        return;
      }
      setPassword('');
      if (body.setup_link) onLink(body.setup_link);
      else {
        toast({ kind: 'success', text: 'Password reset' });
        onClose();
      }
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={() => (busy ? undefined : onClose())} title="Reset password" size="md">
      <p className="text-sm text-[var(--text-2)] mb-3">
        Reset the password for <strong>{target?.email}</strong>.
      </p>
      <select
        className="camp-input w-full mb-3 text-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value as 'setup_link' | 'temp_password')}
      >
        <option value="setup_link">Generate a setup link</option>
        <option value="temp_password">Set a new temp password</option>
      </select>
      {mode === 'temp_password' && (
        <input
          type="text"
          placeholder="New temp password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="camp-input w-full mb-3"
          aria-label="New temp password"
        />
      )}
      <div className="flex justify-end gap-3">
        <button type="button" className="camp-btn-outline px-4" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="camp-btn-primary px-4" onClick={submit} disabled={busy}>
          {busy ? 'Working...' : 'Reset'}
        </button>
      </div>
    </Modal>
  );
}
