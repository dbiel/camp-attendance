'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { DEFAULT_TEMPLATES, type MessageTemplates } from '@/lib/messages-shared';

export function MessageTemplatesSection() {
  const { getAuthHeaders } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/config/templates', { headers });
      if (res.ok) {
        setTemplates((await res.json()).templates);
      } else {
        setLoadError(`Failed to load templates (${res.status})`);
      }
    } catch {
      setLoadError('Failed to load templates — tap to retry.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const headers = {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/config/templates', {
        method: 'PUT',
        headers,
        body: JSON.stringify(templates),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data?.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setSaveError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="camp-card p-4">
      <h2 className="font-semibold">Message templates</h2>
      <p className="mb-2 text-xs text-[var(--text-3)]">
        Placeholders:{' '}
        {'{kid_first} {kid_name} {parent_first} {session} {dorm_building} {dorm_room}'}
      </p>

      {loadError && (
        <div className="mb-2 flex items-center gap-2 text-sm text-red-700">
          <span>{loadError}</span>
          <button
            onClick={loadTemplates}
            className="rounded border px-2 py-0.5 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      <label className="block text-sm font-medium">
        Parent
        <textarea
          value={templates.parent}
          onChange={(e) => setTemplates({ ...templates, parent: e.target.value })}
          className="mt-1 h-24 w-full rounded border p-2 text-sm font-normal"
        />
      </label>

      <label className="mt-2 block text-sm font-medium">
        Dorm staff
        <textarea
          value={templates.dorm_staff}
          onChange={(e) =>
            setTemplates({ ...templates, dorm_staff: e.target.value })
          }
          className="mt-1 h-24 w-full rounded border p-2 text-sm font-normal"
        />
      </label>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save templates'}
        </button>
        {saved && <span className="text-sm text-green-700">Saved ✓</span>}
        {saveError && <span className="text-sm text-red-700">{saveError}</span>}
      </div>
    </section>
  );
}
