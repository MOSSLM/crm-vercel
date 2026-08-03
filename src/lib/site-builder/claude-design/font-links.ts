/**
 * Turns the raw `href` list stored in `sites.shared_assets.fonts` back into
 * correctly-typed `<link>` tags.
 *
 * The import pipeline harvests the design's `<head>` links but keeps only the
 * `href`, throwing the `rel` away (`parse-template-bundle.ts`). Everything was
 * then re-emitted as `rel="stylesheet"` — including the `preconnect` hints,
 * whose href is a bare origin. A profile of a live demo caught the result:
 * `https://fonts.googleapis.com/` and `https://fonts.gstatic.com/` requested as
 * stylesheets, both answering **404**, both render-blocking, 139 ms and 157 ms
 * of the critical path spent on nothing.
 *
 * The `rel` is recoverable from the href itself: a URL with no path and no
 * query can only ever have been a connection hint. Inferring it here (rather
 * than only fixing the importer) repairs every design already in the database,
 * with no re-import.
 */

export interface FontLinkTag {
  rel: "stylesheet" | "preconnect";
  href: string;
  /** Font files are fetched in CORS mode, so the hint must match or it's wasted. */
  crossOrigin?: "anonymous";
}

/** Hosts that serve the font binaries referenced by a stylesheet. */
const CORS_FONT_HOSTS = /(^|\.)(gstatic\.com|typekit\.net)$/i;

/**
 * Build the `<link>` tags for a stored href list, in order, without duplicates.
 * Anything that isn't a usable absolute URL is dropped rather than emitted as a
 * broken stylesheet.
 */
export function resolveFontLinkTags(hrefs: readonly string[]): FontLinkTag[] {
  const out: FontLinkTag[] = [];
  const seen = new Set<string>();

  for (const href of hrefs) {
    if (typeof href !== "string" || !href.trim()) continue;

    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue; // relative or malformed: nothing sensible to emit
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;

    // `FONT_HINTS` in the importer also matches "unpkg" and "cdn", so a script
    // URL can end up in this list. Linking it as a stylesheet fetches it and
    // then discards it.
    if (/\.m?js$/i.test(url.pathname)) continue;

    const isBareOrigin = url.pathname === "/" && !url.search;
    const tag: FontLinkTag = isBareOrigin
      ? {
          rel: "preconnect",
          href: url.origin,
          ...(CORS_FONT_HOSTS.test(url.hostname) ? { crossOrigin: "anonymous" as const } : {}),
        }
      : { rel: "stylesheet", href };

    const key = `${tag.rel}|${tag.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }

  // Connection hints are only worth anything before the request they warm up.
  return [...out.filter((t) => t.rel === "preconnect"), ...out.filter((t) => t.rel === "stylesheet")];
}
