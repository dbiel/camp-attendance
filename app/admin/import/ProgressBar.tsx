'use client';

const STEPS = [
  { num: 1, label: 'Entity' },
  { num: 2, label: 'Upload' },
  { num: 3, label: 'Mapping' },
  { num: 4, label: 'Preview' },
  { num: 5, label: 'Done' },
] as const;

export function ProgressBar({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol
      aria-label="Import progress"
      className="flex flex-wrap items-center gap-2 text-xs mb-4"
    >
      {STEPS.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <li
            key={s.num}
            aria-current={isActive ? 'step' : undefined}
            className="flex items-center gap-1"
          >
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold ${
                isActive
                  ? 'bg-camp-green text-white'
                  : isDone
                  ? 'bg-camp-green/20 text-camp-green'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s.num}
            </span>
            <span
              className={`${
                isActive
                  ? 'text-camp-green font-semibold'
                  : isDone
                  ? 'text-gray-700'
                  : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 text-gray-300">›</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
