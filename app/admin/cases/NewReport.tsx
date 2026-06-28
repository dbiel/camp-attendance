'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface Candidate {
  id: string;
  name: string;
  ensemble: string | null;
  dorm_building?: string;
  instrument: string;
}

/** One editable report in the confirm step. A paste with N kids → N of these. */
interface PersonDraft {
  key: string;
  candidates: Candidate[];
  studentId: string;
  selected: Candidate | null; // the chosen student, shown pinned so the pick is never hidden
  studentQuery: string; // raw name as written (used when "No student found")
  summary: string;
  sessionLabel: string;
  noStudent: boolean; // "No student found" — file unmatched
}

interface ParsedPersonResp {
  candidates: Candidate[];
  student_query: string | null;
  summary: string;
  session_label: string | null;
}

type Stage = 'paste' | 'confirm';

let _seq = 0;
const nextKey = () => `p${_seq++}`;

function emptyDraft(): PersonDraft {
  return { key: nextKey(), candidates: [], studentId: '', selected: null, studentQuery: '', summary: '', sessionLabel: '', noStudent: false };
}

export function NewReport({
  onCreated,
  onRefresh,
  onCancel,
  seedText,
  sourceTextId,
}: {
  onCreated: () => void;
  /** Refresh the hub list WITHOUT closing the form (used on partial failure so
   * filed reports appear while the failed ones stay open for retry). */
  onRefresh?: () => void;
  /** Collapse the form without filing (returns to the plain hub). */
  onCancel?: () => void;
  /** When escalating from the inbox, pre-fill + auto-parse from this text body. */
  seedText?: string;
  /** Originating text id — linked to the Report (escalated_case_id) on create. */
  sourceTextId?: string;
}) {
  const { getAuthHeaders } = useAuth();
  const [stage, setStage] = useState<Stage>('paste');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [rawText, setRawText] = useState(seedText ?? '');
  const [people, setPeople] = useState<PersonDraft[]>([]);
  const [reporterContactId, setReporterContactId] = useState<string | null>(null);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [reporterRole, setReporterRole] = useState('faculty');
  const [needsContactSave, setNeedsContactSave] = useState(false);
  const seededRef = useRef(false);

  function updatePerson(key: string, patch: Partial<PersonDraft>) {
    setPeople((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }
  function removePerson(key: string) {
    setPeople((prev) => prev.filter((p) => p.key !== key));
  }

  async function parse(textOverride?: string) {
    const text = textOverride ?? rawText;
    setBusy(true);
    setError('');
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/cases/parse', { method: 'POST', headers, body: JSON.stringify({ text }) });
      const body = await res.json();
      // Reset reporter so a failed parse can't reuse stale attribution.
      setReporterContactId(null);
      setReporterName('');
      setReporterPhone('');
      setNeedsContactSave(false);
      if (body.ok && Array.isArray(body.people)) {
        const drafts: PersonDraft[] = (body.people as ParsedPersonResp[]).map((pp) => {
          const cands = pp.candidates ?? [];
          return {
            key: nextKey(),
            candidates: cands,
            studentId: cands[0]?.id ?? '',
            selected: cands[0] ?? null,
            studentQuery: pp.student_query ?? '',
            summary: pp.summary ?? '',
            sessionLabel: pp.session_label ?? '',
            noStudent: false,
          };
        });
        setPeople(drafts.length ? drafts : [emptyDraft()]);
        const r = body.reporter ?? {};
        setReporterContactId(r.reporter_contact_id ?? null);
        if (!r.reporter_contact_id && (r.reporter_name || r.reporter_phone)) {
          setReporterName(r.reporter_name ?? '');
          setReporterPhone(r.reporter_phone ?? '');
          setNeedsContactSave(Boolean(r.reporter_phone));
        }
      } else {
        setPeople([emptyDraft()]);
        setError('Parse failed — fill in the report manually.');
      }
      setStage('confirm');
    } catch {
      setPeople([emptyDraft()]);
      setError('Parse failed — fill in the report manually.');
      setStage('confirm');
    } finally {
      setBusy(false);
    }
  }

  // Escalation from the inbox: auto-parse once on mount.
  useEffect(() => {
    if (seedText && seedText.trim() && !seededRef.current) {
      seededRef.current = true;
      parse(seedText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedText]);

  async function create() {
    if (people.length === 0) {
      setError('Nothing to file.');
      return;
    }
    // Every report must be a picked student OR "No student found" WITH a name —
    // never silently file the wrong/blank kid.
    const unresolved = people.find(
      (p) => (!p.noStudent && !p.studentId) || (p.noStudent && !p.studentQuery.trim())
    );
    if (unresolved) {
      setError('Each report needs a student picked, or “No student found” with a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };

      // Save a new reporter contact once for the whole batch.
      let contactId = reporterContactId;
      if (needsContactSave && reporterName && reporterPhone) {
        const cres = await fetch('/api/contacts', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: reporterName, phone: reporterPhone, role: reporterRole }),
        });
        if (cres.ok) {
          contactId = (await cres.json()).id;
          setReporterContactId(contactId);
          setNeedsContactSave(false);
        }
      }

      const payloadPeople = people.map((p) =>
        p.noStudent
          ? {
              needs_match: true,
              student_name: p.studentQuery.trim() || 'Unknown student',
              summary: p.summary || 'Reported missing',
              session_label: p.sessionLabel || null,
            }
          : {
              student_id: p.studentId,
              summary: p.summary || 'Reported missing',
              session_label: p.sessionLabel || null,
            }
      );

      const res = await fetch('/api/cases', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          people: payloadPeople,
          raw_text: rawText,
          reporter_contact_id: contactId,
          reporter_name: reporterName || null,
        }),
      });
      if (!res.ok) {
        let message = 'Create failed';
        try {
          message = (await res.json()).error ?? message;
        } catch {
          /* non-JSON */
        }
        throw new Error(message);
      }
      const { ids, results } = (await res.json()) as {
        ids: string[];
        results?: Array<{ ok: boolean; id?: string; error?: string }>;
      };

      // Link the originating text to the first created Report (best-effort).
      if (sourceTextId && ids?.[0]) {
        try {
          await fetch(`/api/texts/${sourceTextId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ escalated_case_id: ids[0] }),
          });
        } catch {
          /* report still created */
        }
      }

      // Partial failure: results are index-correlated to `people`. KEEP the form
      // open with only the FAILED cards (so the dropped kids are visible and can
      // be retried without re-filing the successes), refresh the hub to show the
      // ones that filed, and surface a persistent error. Only fully clean →close.
      if (results && results.some((r) => !r.ok)) {
        const failedDrafts = people.filter((_, i) => results[i] && !results[i].ok);
        const failMsgs = results.filter((r) => !r.ok).map((r) => r.error).filter(Boolean);
        setPeople(failedDrafts.length ? failedDrafts : people);
        setError(
          `Filed ${ids.length}. ${failMsgs.length} could NOT be filed — fix and retry: ${failMsgs.join('; ')}`
        );
        onRefresh?.(); // show the successes without closing the form
        return;
      }

      // Stay on the hub — it shows all N new reports.
      onCreated();
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
          placeholder="Paste the text message here… (one or several kids)"
          className="h-28 w-full rounded border p-2 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => parse()}
            disabled={busy || !rawText.trim()}
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? 'Parsing…' : 'Parse report'}
          </button>
          {onCancel && (
            <button onClick={onCancel} className="rounded border px-4 py-2" disabled={busy}>
              Cancel
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">
        Confirm {people.length > 1 ? `${people.length} reports` : 'report'}
      </h2>

      <div className="flex flex-col gap-3">
        {people.map((p, i) => (
          <fieldset key={p.key} className="rounded-lg border p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-medium">
              <span>Student {i + 1}</span>
              {people.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePerson(p.key)}
                  className="text-xs text-red-600 hover:underline"
                  aria-label={`Remove report ${i + 1}`}
                >
                  ✕ remove
                </button>
              )}
            </legend>

            {p.noStudent ? (
              <label className="block text-sm font-medium">
                Student name (no roster match)
                <input
                  value={p.studentQuery}
                  onChange={(e) => updatePerson(p.key, { studentQuery: e.target.value })}
                  placeholder="Name as the teacher wrote it"
                  className="mt-1 w-full rounded border p-2 text-sm font-normal"
                />
              </label>
            ) : (
              <StudentPicker
                candidates={p.candidates}
                value={p.studentId}
                selected={p.selected}
                onChange={(cand) => updatePerson(p.key, { studentId: cand.id, selected: cand })}
                getAuthHeaders={getAuthHeaders}
              />
            )}

            <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={p.noStudent}
                onChange={(e) => updatePerson(p.key, { noStudent: e.target.checked })}
              />
              No student found (file anyway, flag to match later)
            </label>

            <label className="mt-2 block text-sm font-medium">
              Summary
              <input
                value={p.summary}
                onChange={(e) => updatePerson(p.key, { summary: e.target.value })}
                placeholder="Reported missing"
                className="mt-1 w-full rounded border p-2 text-sm font-normal"
              />
            </label>
            <label className="mt-2 block text-sm font-medium">
              Where / when missed
              <input
                value={p.sessionLabel}
                onChange={(e) => updatePerson(p.key, { sessionLabel: e.target.value })}
                className="mt-1 w-full rounded border p-2 text-sm font-normal"
              />
            </label>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPeople((prev) => [...prev, emptyDraft()])}
        className="mt-2 text-sm text-camp-green hover:underline"
      >
        + Add another student
      </button>

      {!reporterContactId && (
        <fieldset className="mt-3 rounded border p-2">
          <legend className="px-1 text-sm font-medium">Who reported this? (applies to all)</legend>
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
          {busy ? 'Filing…' : people.length > 1 ? `File ${people.length} reports` : 'File report'}
        </button>
        <button onClick={() => setStage('paste')} className="rounded border px-4 py-2">Back</button>
        {onCancel && (
          <button onClick={onCancel} className="rounded border px-4 py-2" disabled={busy}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Candidate buttons when the parser found matches; always allows a roster
 * search (candidates may all be wrong). The CURRENT selection is shown pinned
 * at the top so a pick is never hidden behind a search — guarding against
 * filing the stale auto-pick against the wrong kid. */
function StudentPicker({ candidates, value, selected, onChange, getAuthHeaders }: {
  candidates: Candidate[];
  value: string;
  selected: Candidate | null;
  onChange: (cand: Candidate) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const headers = await getAuthHeaders();
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

  const options = query.length >= 2 ? results : candidates;
  return (
    <div>
      {/* Pinned current selection — always visible, even mid-search. */}
      {selected && value === selected.id && (
        <p className="mb-2 rounded border border-red-700 bg-red-50 p-2 text-sm">
          <span className="font-semibold">✓ Selected:</span> {selected.name}
          <span className="ml-2 text-gray-500">{selected.instrument} · {selected.ensemble ?? '?'} · {selected.dorm_building || 'commuter'}</span>
        </p>
      )}
      <label className="block text-sm font-medium">
        {selected ? 'Change student' : 'Student'}
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={candidates.length ? 'Wrong match? Search roster…' : 'Search roster…'}
          className="mb-2 mt-1 w-full rounded border p-2 text-sm font-normal"
        />
      </label>
      <div className="flex flex-col gap-1">
        {options.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange(c)}
            className={`rounded border p-2 text-left text-sm ${value === c.id ? 'border-red-700 bg-red-50' : ''}`}
          >
            <span className="font-medium">{c.name}</span>
            <span className="ml-2 text-gray-500">{c.instrument} · {c.ensemble ?? '?'} · {c.dorm_building || 'commuter'}</span>
          </button>
        ))}
        {options.length === 0 && (
          <p className="text-sm text-gray-500">
            {query.length >= 2 ? 'No match — try another spelling, or tick “No student found”.' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
