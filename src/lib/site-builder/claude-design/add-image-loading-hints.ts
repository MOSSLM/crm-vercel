/**
 * Adds native loading hints to the `<img>` tags of a Claude Design page body so
 * demo sites load faster and lighter:
 *   - every <img> gets `decoding="async"` (off-main-thread decode);
 *   - the FIRST <img> in document order stays eager and gets
 *     `fetchpriority="high"` (it is the likely hero / LCP image);
 *   - every subsequent <img> gets `loading="lazy"` (deferred until near-viewport).
 *
 * Any `loading` / `decoding` / `fetchpriority` attribute already present on a tag
 * is preserved (the design's own choice wins).
 *
 * Implementation note: this is a pure string transform that rewrites ONLY the
 * `<img>` tags via a quote-aware regex (so a `>` inside an attribute value can't
 * break the match). It never re-serialises the surrounding markup, so it adds
 * zero drift to the verbatim design HTML — matching the "no design drift"
 * guarantee of wrap-raw-html.ts.
 */

/** Matches a whole `<img ...>` tag, tolerating `>` inside quoted attributes. */
const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

export function addImageLoadingHints(html: string): string {
  let first = true;
  return html.replace(IMG_TAG, (tag) => {
    const hasLoading = /\bloading\s*=/i.test(tag);
    const hasDecoding = /\bdecoding\s*=/i.test(tag);
    const hasPriority = /\bfetchpriority\s*=/i.test(tag);

    let inject = "";
    if (!hasDecoding) inject += ' decoding="async"';
    if (first) {
      first = false;
      if (!hasPriority) inject += ' fetchpriority="high"';
    } else if (!hasLoading) {
      inject += ' loading="lazy"';
    }
    if (!inject) return tag;

    return tag.endsWith("/>")
      ? `${tag.slice(0, -2)}${inject}/>`
      : `${tag.slice(0, -1)}${inject}>`;
  });
}
