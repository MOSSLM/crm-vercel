/**
 * Unguessable subdomain previews for draft / template Claude designs.
 *
 * A published site is served on a friendly, slugified subdomain
 * ({label}.samadigitalstudio.fr, e.g. "ecotherme"). A draft or template has no
 * such label, so its live "Aperçu" is served on a subdomain equal to the site's
 * UUID instead: {siteId}.samadigitalstudio.fr. The UUID is 122 bits of entropy —
 * effectively impossible to guess — and is the same capability token the
 * path-based /preview/{siteId} route already relied on, so nothing new is leaked.
 *
 * The middleware tells the two namespaces apart by shape: a UUID-shaped
 * subdomain routes to the unpublished /preview renderer (resolveDraftSite),
 * everything else to the published /site renderer (resolveSite). Slugified
 * company labels are [a-z0-9-] words and never match the 8-4-4-4-12 hex layout,
 * so the two can't collide.
 */

/** 8-4-4-4-12 hex — a canonical UUID used as an unguessable preview subdomain. */
export const PREVIEW_SUBDOMAIN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `subdomain` is a UUID-shaped draft-preview subdomain. */
export function isPreviewSubdomain(subdomain: string): boolean {
  return PREVIEW_SUBDOMAIN_RE.test(subdomain);
}

/** Hosts where wildcard subdomains don't resolve (local dev, raw IPs). */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

/**
 * Build the shareable, unguessable preview URL for a draft/template site.
 *   production → https://{siteId}.{siteDomain}{path}
 *   local dev  → /preview/{siteId}{path}   (no wildcard DNS, keep the path form)
 *
 * `currentHost` is the browser's `location.host` (may include a port); omit it
 * on the server to always get the production subdomain URL.
 */
export function buildPreviewUrl(
  siteId: string,
  slug: string,
  opts: { siteDomain: string; currentHost?: string },
): string {
  const path = slug && slug !== "/" ? slug : "";
  const host = (opts.currentHost ?? "").split(":")[0];
  if (host && isLocalHost(host)) return `/preview/${siteId}${path}`;
  return `https://${siteId}.${opts.siteDomain}${path}`;
}
