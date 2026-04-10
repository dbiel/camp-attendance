/**
 * Server-side camp config loader.
 *
 * Reads from `config/camp` in Firestore and caches for 30s to avoid
 * hammering the DB on every request. Use `invalidateCampConfigCache()`
 * after writing new config via the Settings page.
 *
 * The admin can read the full config including camp_code. Teacher-facing
 * API routes MUST strip camp_code before returning — use PublicCampConfig.
 */

import { adminDb } from './firebase-admin';
import type { CampConfig, PublicCampConfig } from './types';
import { todayIsoInTimezone, dateToDayKey, type DayKey } from './date';

const TTL_MS = 30_000;

let cache: { value: CampConfig; loadedAt: number } | null = null;

export async function loadActiveCampServer(force = false): Promise<CampConfig> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) {
    return cache.value;
  }
  const doc = await adminDb.collection('config').doc('camp').get();
  if (!doc.exists) {
    throw new Error(
      'config/camp missing — run the Settings page first-save to initialize camp config'
    );
  }
  const data = doc.data() as Partial<CampConfig> | undefined;
  if (
    !data ||
    !data.camp_code ||
    !data.camp_year ||
    !data.start_date ||
    !data.end_date ||
    !data.timezone ||
    !data.day_dates
  ) {
    throw new Error('config/camp is incomplete — missing required fields');
  }
  const value: CampConfig = {
    camp_id: data.camp_id ?? String(data.camp_year),
    camp_code: data.camp_code,
    camp_year: data.camp_year,
    start_date: data.start_date,
    end_date: data.end_date,
    timezone: data.timezone,
    day_dates: data.day_dates,
  };
  cache = { value, loadedAt: Date.now() };
  return value;
}

export function invalidateCampConfigCache(): void {
  cache = null;
}

export function toPublicCampConfig(cfg: CampConfig): PublicCampConfig {
  const { camp_code: _camp_code, ...rest } = cfg;
  return rest;
}

/** Returns the day key for "now" in the camp's timezone, or null if off-camp. */
export function getTodayDayKey(cfg: CampConfig, now: Date = new Date()): DayKey | null {
  const today = todayIsoInTimezone(cfg.timezone, now);
  return dateToDayKey(today, cfg.day_dates);
}
