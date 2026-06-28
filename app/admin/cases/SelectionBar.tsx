'use client';

/**
 * Appears when ≥1 report is selected on the hub. Collects the selection so a
 * single combined staff link can be issued for a building-bounded set.
 *
 * Phase 2 keeps selection "dumb" — it only gathers ids. The combined-issue
 * action (with SERVER-SIDE building-bound + visibility + cap enforcement) lands
 * in Phase 5; the button is intentionally disabled until then.
 */
export function SelectionBar({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-0 z-30 mt-3 flex items-center justify-between rounded-lg border border-camp-green bg-white p-3 shadow-lg">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClear} className="camp-btn-outline px-3 py-1 text-sm">
          Clear
        </button>
        <button
          type="button"
          disabled
          title="Combined staff links arrive in Phase 5"
          className="camp-btn-primary px-3 py-1 text-sm disabled:opacity-50"
        >
          Send combined link
        </button>
      </div>
    </div>
  );
}
