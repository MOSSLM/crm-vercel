/**
 * Shared processing for a parsed Claude Design bundle → the finalised page
 * payload the import routes store.
 *
 * Extracted from MultiPageImportDialog so BOTH the full "import as a new
 * template" flow AND the partial "update selected pages of an existing
 * template" flow run the exact same rewrite → tokenise pipeline (no drift):
 *   - image paths → uploaded public URLs   (rewriteAssets)
 *   - `*.html` cross-links → clean routes   (rewriteCrossLinks)
 *   - dead local `<link>`/`<script>` refs dropped (dropLocalAssetRefs)
 *   - `[Crochets]` → `{{ entreprise.* }}` tokens (bracket mapping)
 *
 * A `slugs` filter narrows every step to a subset of pages (the partial
 * import); omitting it processes the whole bundle (the full import). The
 * shared-vs-page JS split is always computed against the WHOLE bundle so a
 * page's own JS is identical whether it is imported alone or with its siblings.
 *
 * Pure + framework-free (runs in the browser importer and in unit tests).
 */
import type { BundleImage, ParsedBundle } from "./parse-template-bundle";
import { rewriteAssets, rewriteCrossLinks, dropLocalAssetRefs } from "./rewrite-asset-paths";
import { detectBracketTokens, defaultMappingFromTokens, applyBracketTokens } from "./bracket-tokens";

/** One page, fully processed and ready to store (matches ClaudeDesignPageInput). */
export interface ProcessedPage {
  slug: string;
  title: string;
  serviceTag: string | null;
  /** Rewritten-but-still-bracketed source, kept so the mapping pass can re-run. */
  sourceHtml: string;
  /** Body markup with assets rewritten, cross-links cleaned and brackets tokenised. */
  html: string;
  /** This page's OWN runtime JS (its non-shared local `.js` + inline scripts). */
  js: string;
}

/** Template-relative ref path used in the HTML (e.g. "images/hero.jpg"). */
export function refPath(path: string): string {
  const i = path.indexOf("images/");
  return i >= 0 ? path.slice(i) : path.replace(/^.*\//, "");
}

/**
 * A script the index page loads, or that ≥2 pages load, is SHARED (site.js);
 * a script only one non-index page loads is that PAGE's own (service-clim.js).
 * Computed over the whole bundle so the split is stable regardless of selection.
 */
function buildIsShared(bundle: ParsedBundle): (name: string) => boolean {
  const refCount = new Map<string, number>();
  for (const p of bundle.pages) for (const n of p.localScriptRefs) refCount.set(n, (refCount.get(n) ?? 0) + 1);
  const indexRefs = new Set(bundle.pages.find((p) => p.slug === "/")?.localScriptRefs ?? []);
  return (n: string) => indexRefs.has(n) || (refCount.get(n) ?? 0) >= 2;
}

/** The design's shared runtime JS (site.js …), image paths rewritten. */
export function sharedJsFromBundle(bundle: ParsedBundle, urlByPath: Map<string, string>): string {
  const isShared = buildIsShared(bundle);
  return [...new Set(bundle.pages.flatMap((p) => p.localScriptRefs).filter(isShared))]
    .map((n) => bundle.jsByName[n])
    .filter(Boolean)
    .map((js) => rewriteAssets(js, urlByPath))
    .join("\n;\n");
}

/**
 * The bundle images the given pages actually reference — so a partial import
 * uploads only those, not all ~60 images. Detection is a substring scan of each
 * page's body markup + its own runtime JS against every image's ref path, which
 * catches `src`, `srcset`, `data-*` and inline `style` refs alike. Omit `slugs`
 * to get every image (the full import re-uploads them all).
 */
export function imagesForPages(bundle: ParsedBundle, slugs?: string[]): BundleImage[] {
  if (!slugs) return bundle.images;
  const wanted = new Set(slugs);
  const isShared = buildIsShared(bundle);
  const haystack = bundle.pages
    .filter((p) => wanted.has(p.slug))
    .map((page) => {
      const ownJs = page.localScriptRefs.filter((n) => !isShared(n)).map((n) => bundle.jsByName[n] ?? "");
      return [page.html, ...ownJs, ...page.inlineScripts].join("\n");
    })
    .join("\n");
  return bundle.images.filter((img) => haystack.includes(refPath(img.path)));
}

/**
 * Processes the selected pages (or all, when `slugs` is omitted) into the
 * finalised payload. `urlByPath` maps each image ref path to its uploaded
 * public URL. The bracket mapping is derived from the selected pages' tokens —
 * deterministic, so a page tokenises identically alone or with its siblings.
 */
export function buildProcessedPages(
  bundle: ParsedBundle,
  urlByPath: Map<string, string>,
  slugs?: string[],
): ProcessedPage[] {
  const isShared = buildIsShared(bundle);
  const wanted = slugs ? new Set(slugs) : null;
  const selected = wanted ? bundle.pages.filter((p) => wanted.has(p.slug)) : bundle.pages;

  const sources = selected.map((page) => ({
    page,
    sourceHtml: dropLocalAssetRefs(rewriteCrossLinks(rewriteAssets(page.html, urlByPath))),
  }));

  const allTokens = detectBracketTokens(sources.map((s) => s.sourceHtml).join("\n"));
  const mapping = defaultMappingFromTokens(allTokens);

  return sources.map(({ page, sourceHtml }) => {
    const ownJs = page.localScriptRefs.filter((n) => !isShared(n)).map((n) => bundle.jsByName[n]).filter(Boolean);
    const js = [...ownJs, ...page.inlineScripts].map((s) => rewriteAssets(s, urlByPath)).join("\n;\n");
    return {
      slug: page.slug,
      title: page.title,
      serviceTag: page.serviceTag,
      sourceHtml,
      html: applyBracketTokens(sourceHtml, mapping).html,
      js,
    };
  });
}
