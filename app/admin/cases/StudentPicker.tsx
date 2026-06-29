'use client';

import { useState } from 'react';

export interface Candidate {
  id: string;
  name: string;
  ensemble: string | null;
  dorm_building?: string;
  instrument: string;
}

/** Candidate buttons when the parser found matches; always allows a roster
 * search (candidates may all be wrong). The CURRENT selection is shown pinned
 * at the top so a pick is never hidden behind a search — guarding against
 * filing the stale auto-pick against the wrong kid. */
export function StudentPicker({ candidates, value, selected, onChange, getAuthHeaders }: {
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
          <span className="ml-2 text-[var(--text-3)]">{selected.instrument} · {selected.ensemble ?? '?'} · {selected.dorm_building || 'commuter'}</span>
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
            <span className="ml-2 text-[var(--text-3)]">{c.instrument} · {c.ensemble ?? '?'} · {c.dorm_building || 'commuter'}</span>
          </button>
        ))}
        {options.length === 0 && (
          <p className="text-sm text-[var(--text-3)]">
            {query.length >= 2 ? 'No match — try another spelling, or tick "No student found".' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
