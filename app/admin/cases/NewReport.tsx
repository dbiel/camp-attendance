'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { ParsedReport } from '@/lib/case-parse';

interface Candidate {
  id: string;
  name: string;
  ensemble: string | null;
  dorm_building?: string;
  instrument: string;
}

type Stage = 'paste' | 'confirm';

export function NewReport({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const { getAuthHeaders } = useAuth();
  const [stage, setStage] = useState<Stage>('paste');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [rawText, setRawText] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [studentId, setStudentId] = useState('');
  const [summary, setSummary] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [reporterContactId, setReporterContactId] = useState<string | null>(null);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterRole, setReporterRole] = useState('faculty');
  const [needsContactSave, setNeedsContactSave] = useState(false);

  /** Clear any state left over from a previous parse so a failed parse can't
   * silently file a report against the wrong student or reporter. */
  function resetParsedState() {
    setCandidates([]);
    setStudentId('');
    setSummary('');
    setReporterContactId(null);
    setReporterName('');
    setReporterPhone('');
    setNeedsContactSave(false);
  }

  async function parse() {
    setBusy(true);
    setError('');
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/cases/parse', { method: 'POST', headers, body: JSON.stringify({ text: rawText }) });
      const body = await res.json();
      if (body.ok) {
        resetParsedState();
        const p = body.parsed as ParsedReport;
        setCandidates(body.candidates as Candidate[]);
        setStudentId((body.candidates as Candidate[])[0]?.id ?? '');
        setSummary(p.summary);
        setSessionLabel(p.session_label ?? '');
        setReporterContactId(p.reporter_contact_id);
        if (!p.reporter_contact_id && (p.reporter_name || p.reporter_phone)) {
          setReporterName(p.reporter_name ?? '');
          setReporterPhone(p.reporter_phone ?? '');
          setNeedsContactSave(Boolean(p.reporter_phone));
        }
      } else {
        resetParsedState();
        setError('Parse failed — fill in the case manually.');
      }
      setStage('confirm');
    } catch {
      resetParsedState();
      setError('Parse failed — fill in the case manually.');
      setStage('confirm');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!studentId) { setError('Pick a student.'); return; }
    setBusy(true);
    setError('');
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      let contactId = reporterContactId;
      if (needsContactSave && reporterName && reporterPhone) {
        const cres = await fetch('/api/contacts', {
          method: 'POST', headers,
          body: JSON.stringify({ name: reporterName, phone: reporterPhone, role: reporterRole }),
        });
        if (cres.ok) {
          contactId = (await cres.json()).id;
          // Persist so a retry after a failed case-create reuses this contact
          // instead of creating a duplicate.
          setReporterContactId(contactId);
          setNeedsContactSave(false);
        }
      }
      const res = await fetch('/api/cases', {
        method: 'POST', headers,
        body: JSON.stringify({
          student_id: studentId,
          summary: summary || 'Reported missing',
          raw_text: rawText,
          reporter_contact_id: contactId,
          reporter_name: reporterName || null,
          session_label: sessionLabel || null,
        }),
      });
      if (!res.ok) {
        let message = 'Create failed';
        try {
          message = (await res.json()).error ?? message;
        } catch {
          // Non-JSON error body — keep the fallback message.
        }
        throw new Error(message);
      }
      const { id } = await res.json();
      onCreated();
      router.push(`/admin/cases/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'paste') {
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">New report</h2>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the text message here…"
          className="h-28 w-full rounded border p-2 text-sm"
        />
        <button
          onClick={parse}
          disabled={busy || !rawText.trim()}
          className="mt-2 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Parsing…' : 'Parse report'}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">Confirm report</h2>
      <StudentPicker candidates={candidates} value={studentId} onChange={setStudentId} getAuthHeaders={getAuthHeaders} />
      <label className="mt-3 block text-sm font-medium">
        Summary
        <input value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm font-normal" />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Where / when missed
        <input value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm font-normal" />
      </label>
      {!reporterContactId && (
        <fieldset className="mt-3 rounded border p-2">
          <legend className="px-1 text-sm font-medium">Who reported this?</legend>
          <input placeholder="Name" value={reporterName} onChange={(e) => setReporterName(e.target.value)} className="mb-2 w-full rounded border p-2 text-sm" />
          <input placeholder="Phone (optional)" value={reporterPhone} onChange={(e) => { setReporterPhone(e.target.value); setNeedsContactSave(Boolean(e.target.value)); }} className="mb-2 w-full rounded border p-2 text-sm" />
          <select value={reporterRole} onChange={(e) => setReporterRole(e.target.value)} className="w-full rounded border p-2 text-sm">
            <option value="faculty">Faculty</option>
            <option value="dorm_staff">Dorm staff</option>
            <option value="other">Other</option>
          </select>
        </fieldset>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={create} disabled={busy} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create report'}
        </button>
        <button onClick={() => setStage('paste')} className="rounded border px-4 py-2">Back</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Candidate buttons when the parser found matches; falls back to a name search against /api/students/search. */
function StudentPicker({ candidates, value, onChange, getAuthHeaders }: {
  candidates: Candidate[];
  value: string;
  onChange: (id: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const headers = await getAuthHeaders();
    // Real contract: GET /api/students/search?q=<query>&limit=<n>
    // Response: { results: StudentSearchResult[], total: number, truncated: boolean }
    // StudentSearchResult fields: id, first_name, last_name, preferred_name, instrument, ensemble, dorm_building, dorm_room
    const res = await fetch(`/api/students/search?q=${encodeURIComponent(q)}&limit=8`, { headers });
    if (res.ok) {
      const body = await res.json();
      const list = (body.results ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        preferred_name: string | null;
        instrument: string;
        ensemble: string | null;
        dorm_building: string | null;
      }>;
      setResults(list.map((s) => ({
        id: s.id,
        name: s.preferred_name ? `${s.preferred_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`,
        ensemble: s.ensemble,
        dorm_building: s.dorm_building ?? undefined,
        instrument: s.instrument,
      })));
    }
  }

  const options = candidates.length > 0 ? candidates : results;
  return (
    <div>
      <label className="block text-sm font-medium">
        Student
        {candidates.length === 0 && (
          <input value={query} onChange={(e) => search(e.target.value)} placeholder="Search roster…" className="mb-2 mt-1 w-full rounded border p-2 text-sm font-normal" />
        )}
      </label>
      <div className="flex flex-col gap-1">
        {options.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`rounded border p-2 text-left text-sm ${value === c.id ? 'border-red-700 bg-red-50' : ''}`}
          >
            <span className="font-medium">{c.name}</span>
            <span className="ml-2 text-gray-500">{c.instrument} · {c.ensemble ?? '?'} · {c.dorm_building || 'commuter'}</span>
          </button>
        ))}
        {options.length === 0 && <p className="text-sm text-gray-500">No match — search the roster above.</p>}
      </div>
    </div>
  );
}
