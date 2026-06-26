/**
 * Rewrites template-relative asset paths and cross-page links in a Claude
 * Design page so it can be hosted from Supabase + served on clean Next routes.
 *
 *  - rewriteAssets: `images/x.png` (in src/href/url()) → its uploaded public URL.
 *    Works on HTML and on the shared CSS (`url(images/…)`).
 *  - rewriteCrossLinks: `service-climatisation.html` → `/service-climatisation`,
 *    `index.html` → `/`, preserving `#anchor` fragments.
 *
 * Pure + side-effect free.
 */

/** Escape a string for use as a literal in a global RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every occurrence of each original template-relative path with its
 * uploaded public URL. The map keys are the exact paths as they appear in the
 * markup (e.g. "images/clim-gainable.png"). Longer paths are replaced first so
 * a path that is a prefix of another can't partially match.
 */
export function rewriteAssets(source: string, urlByOriginalPath: Map<string, string>): string {
  let out = source;
  const paths = Array.from(urlByOriginalPath.keys()).sort((a, b) => b.length - a.length);
  for (const path of paths) {
    const url = urlByOriginalPath.get(path);
    if (!url) continue;
    out = out.replace(new RegExp(escapeRegExp(path), "g"), url);
  }
  return out;
}

/**
 * Converts a template page file name to its public route slug.
 *   index.html              → "/"
 *   service-climatisation.html → "/service-climatisation"
 *   a-propos.html           → "/a-propos"
 */
export function fileNameToSlug(fileName: string): string {
  const base = fileName.replace(/^.*\//, "").replace(/\.html?$/i, "");
  if (base === "index") return "/";
  return `/${base}`;
}

/**
 * Rewrites in-template `*.html` links to clean routes, keeping `#fragment`s.
 *   href="service-climatisation.html"        → href="/service-climatisation"
 *   href="index.html#contact"                → href="/#contact"
 *   href="index.html"                        → href="/"
 * Only matches relative links (no scheme, no leading slash) ending in `.html`.
 */
export function rewriteCrossLinks(html: string): string {
  return html.replace(
    /(href|action)="(?!https?:|\/|#|mailto:|tel:)([^"#?]+?)\.html(#[^"]*)?"/gi,
    (_full, attr: string, base: string, frag: string | undefined) => {
      const slug = fileNameToSlug(`${base}.html`);
      const fragment = frag ?? "";
      // "/" + "#contact" should read "/#contact", not "/#contact" with a double slash.
      const href = slug === "/" ? `/${fragment}` : `${slug}${fragment}`;
      return `${attr}="${href}"`;
    },
  );
}

/**
 * Drops local stylesheet/script `<link>`/`<script src>` to the template's own
 * files (styles.css, theme-tokens.css, site.js, …): the shared CSS is injected
 * by the renderer and the runtime is re-implemented, so these dead local refs
 * must go. Remote links (fonts, leaflet CDN) are kept.
 */
export function dropLocalAssetRefs(html: string): string {
  return html
    // <link ... href="styles.css" ...> where href is relative + .css
    .replace(/<link\b[^>]*\bhref="(?!https?:|\/)[^"]+\.css"[^>]*>/gi, "")
    // <script ... src="site.js" ...></script> where src is relative + .js
    .replace(/<script\b[^>]*\bsrc="(?!https?:|\/)[^"]+\.js"[^>]*>\s*<\/script>/gi, "");
}
