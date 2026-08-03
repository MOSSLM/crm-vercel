import { revalidateTag } from "next/cache";

/**
 * Cache invalidation for a site's rendered output.
 *
 * The draft preview reads a site, its section instances, its variables and its
 * design assets on every hit. That work is cached in Next's Data Cache and tied
 * to the tag below, so a save can drop it immediately instead of waiting for a
 * timer — an operator has to see their edit the moment they switch tabs.
 *
 * Two rules keep this honest:
 *
 *  1. Every route that writes something the preview renders calls
 *     `invalidateSiteCache(siteId)`. One helper, one tag, so a new write route
 *     has one obvious thing to do.
 *  2. The cached entry ALSO carries a short `revalidate` (see
 *     `SITE_CACHE_REVALIDATE_SECONDS`). Rule 1 is a human process across ~17
 *     routes and will eventually be missed; the timer makes that failure "stale
 *     for a few seconds" rather than "stale until redeploy". It is a safety
 *     net, not the mechanism.
 */
export function siteCacheTag(siteId: string): string {
  return `site:${siteId}`;
}

/**
 * Upper bound on staleness if a write route ever forgets to invalidate.
 * Short enough that a missed tag is a shrug, long enough that a burst of hits
 * on one preview still collapses onto a single render.
 */
export const SITE_CACHE_REVALIDATE_SECONDS = 30;

/**
 * Drop every cached render input for a site. Safe to call from any route
 * handler; never throws, because a failed invalidation must not turn a
 * successful save into a 500 — the `revalidate` window still bounds the damage.
 */
export function invalidateSiteCache(siteId: string | null | undefined): void {
  if (!siteId) return;
  try {
    revalidateTag(siteCacheTag(siteId));
  } catch (err) {
    console.warn(
      `[site-cache] revalidateTag failed for ${siteId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
