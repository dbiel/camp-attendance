'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';

/**
 * Danger zone: wipe all roster + report data for a fresh new-year load.
 * super_admin only (the page mounts it conditionally AND the route enforces
 * super_admin + a server-side RESET check — the UI gate is not the boundary).
 */
export function ClearAllDataSection() {
  const { getAuthHeaders } = useAuth();
  const { push: toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setConfirmText('');
  }

  async function handleWipe() {
    if (confirmText !== 'RESET') return;
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ confirm: 'RESET' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Wipe failed (${res.status})` });
        return;
      }
      toast({
        kind: 'success',
        text: `Cleared ${Array.isArray(body.cleared) ? body.cleared.length : 0} collections — ready for new data`,
      });
      setOpen(false);
      setConfirmText('');
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="camp-card p-6 border-2 border-red-200">
      <h2 className="camp-subheading text-red-700">Danger Zone — Clear All Data</h2>
      <p className="text-sm text-[var(--text-2)] mb-4">
        Permanently deletes <strong>students, faculty, sessions, periods, enrollments,
        and all reports</strong>. Use this once before loading a new year&apos;s roster.
        It does <strong>not</strong> touch your camp code, admin logins, or texts.
        This cannot be undone.
      </p>
      <button type="button" className="camp-btn-danger px-6" onClick={() => setOpen(true)}>
        Clear All Data…
      </button>

      <Modal open={open} onClose={close} title="Clear ALL camp data?" size="md">
        <p className="text-sm text-[var(--text-2)] mb-3">
          This deletes the entire roster, schedule, and every report. There is no undo.
          Type <code className="font-mono bg-[var(--surface)] border border-[var(--glass-border)] rounded px-1.5 py-0.5">RESET</code>{' '}
          to confirm.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESET"
          className="camp-input w-full font-mono mb-6"
          autoComplete="off"
          disabled={busy}
          aria-label="Type RESET to confirm"
        />
        <div className="flex justify-end gap-3">
          <button type="button" className="camp-btn-outline px-4" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="camp-btn-danger px-4"
            onClick={handleWipe}
            disabled={busy || confirmText !== 'RESET'}
          >
            {busy ? 'Clearing…' : 'Permanently clear everything'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
