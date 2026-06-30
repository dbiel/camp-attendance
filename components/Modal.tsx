'use client';
import { ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, size = 'lg' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Focus the first focusable in the CONTENT — skip the header close button so
    // opening lands on the dialog's own controls, not the ✕.
    const nodes = ref.current
      ? Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    const firstFocusable = nodes.find((n) => !n.hasAttribute('data-modal-close')) ?? nodes[0];
    firstFocusable?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && ref.current) {
        const nodes = Array.from(
          ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((n) => !n.hasAttribute('disabled'));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black bg-opacity-50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Full-screen scrollable sheet on mobile (all on one view); centered card
          with internal scroll on sm+. */}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${sizeClass} overflow-y-auto bg-white p-6 shadow-xl max-h-screen rounded-none sm:max-h-[90vh] sm:rounded-lg`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold text-camp-green">
            {title}
          </h2>
          <button
            type="button"
            data-modal-close
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--text-2)] hover:bg-black/5 active:bg-black/10"
          >
            ✕ Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
