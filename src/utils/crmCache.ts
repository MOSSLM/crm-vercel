/**
 * SWR cache for the CRM dataset (opportunities / pipelines / stages / offers),
 * persisted to localStorage so the UI paints instantly on the next load.
 *
 * The payload contains commercial data — client names, deal amounts — so it is
 * scoped to the user who fetched it and cleared on sign-out:
 *
 *   - `user_id` is stored alongside the data and checked on read, so a second
 *     account signing in on the same browser can never hydrate from the first
 *     account's cache (the hydration effect runs before the network fetch).
 *   - `clearCrmCache()` runs on logout and whenever the session drops.
 *
 * Both guards are kept on purpose: the scoping holds even if a clear is missed
 * (crash, tab killed mid-logout), and the clear bounds how long the data sits
 * on disk rather than relying on the TTL alone.
 */

import { CACHE_KEY, CACHE_TTL_MS } from './constants';
import type { Offer, Opportunity, Pipeline, PipelineStage } from '@/types';

export interface CachedData {
  opportunities: Opportunity[];
  pipelines: Pipeline[];
  pipelineStages: PipelineStage[];
  offers: Offer[];
  cached_at: number;
  user_id: string;
}

/**
 * Returns the cached dataset for `userId`, or null when there is nothing
 * usable: no entry, malformed JSON, expired TTL, or an entry belonging to a
 * different user.
 */
export function loadCrmCache(userId: string | null | undefined): CachedData | null {
  if (typeof window === 'undefined') return null;
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedData;
    if (!parsed.cached_at || Date.now() - parsed.cached_at > CACHE_TTL_MS) return null;
    if (parsed.user_id !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCrmCache(
  userId: string | null | undefined,
  data: Omit<CachedData, 'cached_at' | 'user_id'>,
): void {
  if (typeof window === 'undefined') return;
  // Without an owner the entry could be hydrated by the next account — don't write it.
  if (!userId) return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...data, cached_at: Date.now(), user_id: userId }),
    );
  } catch {
    // localStorage quota exceeded – silently ignore
  }
}

/** Drops the cached dataset. Safe to call when nothing is cached. */
export function clearCrmCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage disabled (private mode / blocked cookies) — nothing to clear.
  }
}
