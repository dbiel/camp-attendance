'use client';

/**
 * Client-side camp config provider. Fetches /api/config/camp on mount and
 * holds the PublicCampConfig in React context so every page can render
 * day selectors, highlight "today", and convert day keys to ISO dates
 * without hardcoding dates anywhere.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { auth } from '@/lib/firebase';
import { getCampCodeHeaders } from '@/lib/camp-code';
import {
  dateToDayKey,
  todayIsoInTimezone,
  type DayKey,
} from '@/lib/date';
import type { PublicCampConfig } from '@/lib/types';

interface CampConfigContextValue {
  config: PublicCampConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CampConfigContext = createContext<CampConfigContextValue | null>(null);

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }
  return getCampCodeHeaders();
}

export function CampConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicCampConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/config/camp', { headers });
      if (!res.ok) {
        if (res.status !== 401) {
          setError(`config fetch failed: ${res.status}`);
        }
        setConfig(null);
        return;
      }
      const data = (await res.json()) as PublicCampConfig;
      setConfig(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CampConfigContext.Provider value={{ config, loading, error, refresh }}>
      {children}
    </CampConfigContext.Provider>
  );
}

export function useCampConfig(): CampConfigContextValue {
  const ctx = useContext(CampConfigContext);
  if (!ctx) {
    throw new Error('useCampConfig must be used inside a CampConfigProvider');
  }
  return ctx;
}

/**
 * Returns the day key for "today" in the active camp's timezone, or null
 * if today is off-camp or the config hasn't loaded yet.
 */
export function useTodayDayKey(): DayKey | null {
  const { config } = useCampConfig();
  if (!config) return null;
  const today = todayIsoInTimezone(config.timezone);
  return dateToDayKey(today, config.day_dates);
}
