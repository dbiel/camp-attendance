'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import { deriveDayDates } from '@/lib/date';
import type { CampConfig } from '@/lib/types';
import { InputStep } from './InputStep';
import { PreviewStep } from './PreviewStep';
import { SuccessStep } from './SuccessStep';
import { FormState, RolloverResult, Step, TIMEZONE_OPTIONS } from './types';

export default function RolloverWizardPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { push: toast } = useToast();

  const [config, setConfig] = useState<CampConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [step, setStep] = useState<Step>('input');
  const [form, setForm] = useState<FormState>({
    newYear: '',
    newStartDate: '',
    newEndDate: '',
    timezone: 'America/Chicago',
    customTimezone: '',
    clearEnsembleAssignments: true,
  });
  const [previewResult, setPreviewResult] = useState<RolloverResult | null>(null);
  const [finalResult, setFinalResult] = useState<RolloverResult | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

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
        if (cancelled) return;
        setConfig(data);
        // Pre-fill timezone and suggest next year.
        const nextYear = String(data.camp_year + 1);
        const initialTz = TIMEZONE_OPTIONS.includes(data.timezone)
          ? data.timezone
          : '__custom__';
        setForm((prev) => ({
          ...prev,
          newYear: nextYear,
          timezone: initialTz,
          customTimezone: initialTz === '__custom__' ? data.timezone : '',
        }));
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

  // Scroll to top on step transition — nicer than leaving the user in
  // the middle of a tall form when they move to a different view.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // beforeunload guard: block nav mid-rollover. inFlightRef tracks the
  // real (non-dry-run) request so navigation during the preview fetch
  // isn't penalized — the preview is idempotent.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!inFlightRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const effectiveTimezone =
    form.timezone === '__custom__' ? form.customTimezone.trim() : form.timezone;

  const preview = useMemo<{
    dayDates: Record<string, string> | null;
    error: string | null;
  }>(() => {
    if (!form.newStartDate || !form.newEndDate) {
      return { dayDates: null, error: null };
    }
    try {
      return {
        dayDates: deriveDayDates(form.newStartDate, form.newEndDate),
        error: null,
      };
    } catch (e) {
      return { dayDates: null, error: (e as Error).message };
    }
  }, [form.newStartDate, form.newEndDate]);

  const yearValid = useMemo(() => {
    if (!/^\d{4}$/.test(form.newYear)) return false;
    if (!config) return true;
    return Number.parseInt(form.newYear, 10) > config.camp_year;
  }, [form.newYear, config]);

  const inputFormValid =
    yearValid &&
    !!preview.dayDates &&
    effectiveTimezone.length > 0 &&
    form.newEndDate >= form.newStartDate;

  async function callRollover(dryRun: boolean): Promise<RolloverResult | null> {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/camps/rollover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          new_year: form.newYear.trim(),
          new_start_date: form.newStartDate,
          new_end_date: form.newEndDate,
          new_timezone: effectiveTimezone,
          clear_ensemble_assignments: form.clearEnsembleAssignments,
          dry_run: dryRun,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as
        | RolloverResult
        | { error?: string };
      if (!res.ok) {
        const err =
          (body as { error?: string }).error ||
          `Rollover failed (${res.status})`;
        console.error(
          '[rollover]',
          dryRun ? 'dry-run' : 'final',
          'failed:',
          body
        );
        toast({ kind: 'error', text: err });
        return null;
      }
      return body as RolloverResult;
    } catch (err) {
      const msg = (err as Error).message || 'Rollover failed';
      console.error('[rollover] network error:', err);
      toast({ kind: 'error', text: msg });
      return null;
    }
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!inputFormValid || submitting) return;
    setSubmitting(true);
    const result = await callRollover(true);
    setSubmitting(false);
    if (result) {
      setPreviewResult(result);
      setStep('preview');
      toast({
        kind: 'info',
        text: 'Preview ready — review before running rollover',
      });
    }
  }

  async function handleConfirm() {
    if (submitting) return;
    const expected = `ROLLOVER ${form.newYear.trim()}`;
    if (confirmText.trim() !== expected) return;
    setSubmitting(true);
    inFlightRef.current = true;
    const result = await callRollover(false);
    inFlightRef.current = false;
    setSubmitting(false);
    if (result) {
      setFinalResult(result);
      setStep('success');
      toast({
        kind: 'success',
        text: `Rollover complete — welcome to ${result.new_id}`,
      });
    }
  }

  async function handleRetryPreview() {
    const result = await callRollover(true);
    if (result) setPreviewResult(result);
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
          <nav aria-label="Breadcrumb" className="text-sm opacity-75 mb-2">
            <Link
              href="/admin/dashboard"
              className="hover:opacity-100 hover:underline"
            >
              Admin
            </Link>
            <span className="mx-2">/</span>
            <Link
              href="/admin/settings"
              className="hover:opacity-100 hover:underline"
            >
              Settings
            </Link>
            <span className="mx-2">/</span>
            <span className="opacity-100">Rollover</span>
          </nav>
          <h1 className="text-2xl font-bold">Yearly Rollover</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6" aria-live="polite">
        {loadingConfig && (
          <div className="camp-card p-6 text-gray-600">Loading camp config...</div>
        )}

        {configError && (
          <div className="camp-card p-6 text-red-700 bg-red-50 border border-red-200">
            {configError}
          </div>
        )}

        {config && step === 'input' && (
          <InputStep
            config={config}
            form={form}
            setForm={setForm}
            preview={preview}
            yearValid={yearValid}
            canSubmit={inputFormValid && !submitting}
            submitting={submitting}
            onSubmit={handlePreview}
          />
        )}

        {config && step === 'preview' && previewResult && (
          <PreviewStep
            config={config}
            form={form}
            previewResult={previewResult}
            effectiveTimezone={effectiveTimezone}
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            submitting={submitting}
            onBack={() => setStep('input')}
            onConfirm={handleConfirm}
            onRetryPreview={handleRetryPreview}
          />
        )}

        {finalResult && step === 'success' && (
          <SuccessStep result={finalResult} />
        )}
      </div>
    </div>
  );
}
