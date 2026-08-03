/**
 * `theme_sections.example_data` doubles as a section's default content AND as a
 * scratchpad for import-time artefacts. Two of those artefacts are a full copy
 * of the page's HTML each, and the render path spreads `example_data` wholesale
 * into a section's `content` — which then travels to the browser inside the
 * hydration JSON, escaped character by character.
 *
 * Only `__page_js` is read at render time (DynamicPageRenderer injects it after
 * the design's shared JS). `__source_html` and `__token_html` exist for the
 * editor and the re-tokenise / mapping / copy-images routes, which read them
 * from the database themselves. Dropping them on the render path costs nothing
 * and removes several copies of the page from both the DB transfer and the
 * response body.
 */
export const IMPORT_ONLY_EXAMPLE_KEYS = ["__source_html", "__token_html"] as const;

/** `example_data` with the import-only HTML blobs removed. */
export function pickRenderExampleData(
  exampleData: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!exampleData) return exampleData;

  let stripped: Record<string, unknown> | null = null;
  for (const key of IMPORT_ONLY_EXAMPLE_KEYS) {
    if (key in exampleData) {
      // Copy lazily: rows without the artefacts (native library sections) are
      // returned untouched rather than needlessly cloned.
      stripped ??= { ...exampleData };
      delete stripped[key];
    }
  }
  return stripped ?? exampleData;
}
