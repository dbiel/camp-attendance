'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import type {
  ColumnMapping,
  NormalizedRow,
  ParsedFile,
} from '@/lib/import-parsers';
import type { EntityName } from '@/lib/import-schemas';

import { EntityStep } from './EntityStep';
import { UploadStep } from './UploadStep';
import { MappingStep } from './MappingStep';
import { PreviewStep } from './PreviewStep';
import { ResultStep, type ImportResultData } from './ResultStep';
import { ProgressBar } from './ProgressBar';
import { buildImportPayload, saveMapping } from './mapping-storage';

type Step = 1 | 2 | 3 | 4 | 5;

export default function ImportPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { push: toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [entity, setEntity] = useState<EntityName | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [normalizedRows, setNormalizedRows] = useState<NormalizedRow[]>([]);
  const [clientFailedCount, setClientFailedCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultData | null>(null);

  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/admin');
  }, [user, authLoading, router]);

  // Scroll to top on step transitions.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  function resetAll() {
    setStep(1);
    setEntity(null);
    setParsed(null);
    setMapping(null);
    setNormalizedRows([]);
    setClientFailedCount(0);
    setResult(null);
  }

  function onEntitySelected(e: EntityName) {
    setEntity(e);
    setParsed(null);
    setMapping(null);
    setStep(2);
  }

  function onParsed(p: ParsedFile) {
    setParsed(p);
    if (p.truncated) {
      toast({
        kind: 'info',
        text: `File truncated to first ${p.rows.length.toLocaleString()} rows.`,
      });
    }
    setStep(3);
  }

  function onMappingConfirmed(m: ColumnMapping) {
    setMapping(m);
    setStep(4);
  }

  async function onImport(validRows: NormalizedRow[]) {
    if (!entity || !parsed || !mapping) return;
    if (validRows.length === 0) {
      toast({ kind: 'error', text: 'No valid rows to import' });
      return;
    }
    setImporting(true);
    try {
      const authHeaders = await getAuthHeaders();
      const payload = buildImportPayload(
        entity,
        validRows.map((r) => r.data),
      );
      const res = await fetch(`/api/import/${entity}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || `Import failed (${res.status})`;
        toast({ kind: 'error', text: msg });
        return;
      }
      const data: ImportResultData = {
        success: Number(body?.success ?? 0),
        failed: Number(body?.failed ?? 0),
        errors: Array.isArray(body?.errors) ? body.errors : [],
      };
      setResult(data);
      // Persist mapping now that the admin confirmed it was usable.
      saveMapping(entity, parsed.headers, mapping);
      if (data.failed === 0) {
        toast({ kind: 'success', text: `Imported ${data.success} ${entity}` });
      } else {
        toast({
          kind: 'info',
          text: `Imported ${data.success}, ${data.failed} failed server-side.`,
        });
      }
      setStep(5);
    } catch (err) {
      toast({
        kind: 'error',
        text:
          err instanceof Error ? err.message : 'Network error during import',
      });
    } finally {
      setImporting(false);
    }
  }

  // Capture normalized rows + client error count whenever we land on step 4.
  // We get them from PreviewStep via a callback lifted to the page so the
  // Result step can build the failed-rows CSV without re-normalizing.
  function captureNormalized(rows: NormalizedRow[]) {
    setNormalizedRows(rows);
    setClientFailedCount(rows.filter((r) => r.errors.length > 0).length);
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-camp-green text-white p-4 sticky top-0 z-40 shadow-md">
        <Link
          href="/admin/dashboard"
          className="text-sm opacity-75 hover:opacity-100 mb-2 block"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Import Data</h1>
      </div>

      <div ref={topRef} className="max-w-3xl mx-auto p-4">
        <ProgressBar current={step} />

        {step === 1 && <EntityStep onSelect={onEntitySelected} />}

        {step === 2 && entity && (
          <UploadStep
            entity={entity}
            onParsed={onParsed}
            onBack={() => setStep(1)}
            onError={(msg) => toast({ kind: 'error', text: msg })}
          />
        )}

        {step === 3 && entity && parsed && (
          <MappingStep
            entity={entity}
            parsed={parsed}
            initialMapping={mapping}
            onBack={() => setStep(2)}
            onConfirm={onMappingConfirmed}
          />
        )}

        {step === 4 && entity && parsed && mapping && (
          <PreviewStep
            entity={entity}
            parsed={parsed}
            mapping={mapping}
            importing={importing}
            onBack={() => setStep(3)}
            onImport={onImport}
            onNormalized={captureNormalized}
          />
        )}

        {step === 5 && entity && parsed && result && (
          <ResultStep
            entity={entity}
            result={result}
            parsed={parsed}
            normalizedRows={normalizedRows}
            serverErrors={result.errors}
            clientFailedCount={clientFailedCount}
            onImportMore={resetAll}
          />
        )}
      </div>
    </div>
  );
}
