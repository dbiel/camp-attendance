'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCampConfig } from '@/lib/camp-config-client';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { CampIdentitySection } from './CampIdentitySection';
import type { CampConfig } from '@/lib/types';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { refresh: refreshPublicConfig } = useCampConfig();
  const { push: toast } = useToast();

  // Admin fetches the full CampConfig (including camp_code) separately
  // from the public context provider, which strips it for teachers.
  const [config, setConfig] = useState<CampConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/config/camp', { headers });
        if (!res.ok) {
          setConfigError(
            res.status === 403
              ? 'Admin access required'
              : `Failed to load config (${res.status})`
          );
          return;
        }
        const data = (await res.json()) as CampConfig;
        if (!cancelled) setConfig(data);
      } catch (e) {
        if (!cancelled) setConfigError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, getAuthHeaders]);

  async function saveIdentity(patch: {
    start_date: string;
    end_date: string;
    timezone: string;
    day_dates: Record<string, string>;
  }): Promise<{ ok: true; config: CampConfig } | { ok: false; error: string }> {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/config/camp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = body?.error || `Save failed (${res.status})`;
        toast({ kind: 'error', text: error });
        return { ok: false, error };
      }
      toast({ kind: 'success', text: 'Camp identity saved' });
      // Refresh the shared public config so every page that reads day_dates
      // picks up new values immediately.
      void refreshPublicConfig();
      return { ok: true, config: body as CampConfig };
    } catch (err) {
      const error = (err as Error).message;
      toast({ kind: 'error', text: error });
      return { ok: false, error };
    }
  }

  async function handleRotateCode() {
    setRotating(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/config/camp-code/rotate', {
        method: 'POST',
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ kind: 'error', text: body?.error || `Rotate failed (${res.status})` });
        return;
      }
      const newCode = body.camp_code as string;
      setConfig((prev) => (prev ? { ...prev, camp_code: newCode } : prev));
      toast({ kind: 'success', text: `New code: ${newCode} — distribute to faculty` });
      setRotateOpen(false);
    } catch (err) {
      toast({ kind: 'error', text: (err as Error).message });
    } finally {
      setRotating(false);
    }
  }

  async function copyCode() {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(config.camp_code);
      toast({ kind: 'info', text: 'Code copied to clipboard' });
    } catch {
      toast({ kind: 'error', text: 'Copy failed — select and copy manually' });
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/admin/dashboard"
            className="text-sm opacity-75 hover:opacity-100 mb-2 block"
          >
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {loadingConfig && (
          <div className="camp-card p-6 text-gray-600">Loading camp config...</div>
        )}

        {configError && (
          <div className="camp-card p-6 text-red-700 bg-red-50 border border-red-200">
            {configError}
          </div>
        )}

        {config && (
          <>
            <CampIdentitySection
              config={config}
              onSave={saveIdentity}
              onConfigUpdate={setConfig}
            />

            {/* Teacher Camp Code */}
            <section className="camp-card p-6">
              <h2 className="camp-subheading">Teacher Camp Code</h2>
              <p className="text-sm text-gray-500 mb-4">
                Faculty devices enter this code once to unlock the teacher
                portal. Rotate after camp ends or if the code leaks.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="font-mono text-xl bg-gray-100 border border-gray-200 rounded px-4 py-2 tracking-wider">
                  {config.camp_code}
                </code>
                <button type="button" className="camp-btn-outline px-4" onClick={copyCode}>
                  Copy
                </button>
                <button
                  type="button"
                  className="camp-btn-accent px-4"
                  onClick={() => setRotateOpen(true)}
                >
                  Rotate Code
                </button>
              </div>
            </section>

            {/* Yearly Rollover */}
            <section className="camp-card p-6">
              <h2 className="camp-subheading">Yearly Rollover</h2>
              <p className="text-sm text-gray-600 mb-4">
                Archive this year&apos;s data and start a new camp year. Run
                this once after camp ends.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/settings/rollover"
                  className="camp-btn-primary px-6"
                >
                  Start Rollover Wizard
                </Link>
              </div>
            </section>
          </>
        )}
      </div>

      <Modal
        open={rotateOpen}
        onClose={() => (rotating ? undefined : setRotateOpen(false))}
        title="Rotate teacher camp code?"
        size="md"
      >
        <p className="text-sm text-gray-700 mb-6">
          Rotating the code will log out every teacher. They&apos;ll need to
          re-enter the new code on their devices. Continue?
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="camp-btn-outline px-4"
            onClick={() => setRotateOpen(false)}
            disabled={rotating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="camp-btn-accent px-4"
            onClick={handleRotateCode}
            disabled={rotating}
          >
            {rotating ? 'Rotating...' : 'Rotate code'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
