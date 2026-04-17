'use client';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from 'react';

type Toast = {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
};

const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, ...t }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] space-y-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded shadow-md text-white ${
              t.kind === 'error'
                ? 'bg-red-600'
                : t.kind === 'success'
                ? 'bg-green-600'
                : 'bg-gray-800'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be inside ToastProvider');
  return c;
}
