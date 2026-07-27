/**
 * Keeps a recoverable copy of a page's inline `__overrides` before anything
 * overwrites them.
 *
 * A Claude Design template carries hundreds of hand-placed photos, stored only
 * as `site_section_instances.content.__overrides`. Nothing else in the stack
 * archives them: `site_versions` holds the style guide and sitemap, there is no
 * audit trigger on the table, and the editor's undo stack lives in browser
 * memory. So an import that rewrites the markup was, until this module, the last
 * word — and when its path-remapping came up short the photos were simply gone.
 *
 * Two pieces are stored, deliberately in two different places:
 *
 *   - the overrides themselves → `content.__backups` on the INSTANCE. They are
 *     URLs and dotted paths, so several generations cost almost nothing.
 *   - the markup they were keyed against → `example_data.__prev_token_html` on
 *     the SECTION (see `previousTokenHtml`). One copy per page rather than one
 *     per backup, which bounds the size while keeping what a later, *accurate*
 *     remap needs: without the old HTML, restoring can only guess.
 */

export interface OverrideBackup {
  /** ISO timestamp of the overwrite this backup protects against. */
  at: string;
  /** What triggered it, e.g. "import-pages" or "copy-images". */
  reason: string;
  /** Human hint shown in the restore dialog (page title or slug). */
  label?: string;
  overrides: Record<string, unknown>;
}

/** Where the backups live inside `site_section_instances.content`. */
export const BACKUPS_KEY = "__backups";
/** Where the replaced markup lives inside `theme_sections.example_data`. */
export const PREV_HTML_KEY = "__prev_token_html";

const DEFAULT_KEEP = 5;

export function readBackups(content: Record<string, unknown> | null | undefined): OverrideBackup[] {
  const raw = content?.[BACKUPS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is OverrideBackup =>
      !!b && typeof (b as OverrideBackup).at === "string" && typeof (b as OverrideBackup).overrides === "object",
  );
}

/**
 * Returns a copy of `content` with `backup` pushed in front, capped at `keep`.
 * A backup with no overrides is skipped: recording "there was nothing" only
 * pushes a real generation out of the window.
 */
export function pushBackup(
  content: Record<string, unknown>,
  backup: OverrideBackup,
  keep = DEFAULT_KEEP,
): Record<string, unknown> {
  if (Object.keys(backup.overrides ?? {}).length === 0) return content;
  return { ...content, [BACKUPS_KEY]: [backup, ...readBackups(content)].slice(0, keep) };
}

/** The markup replaced by the previous overwrite, if it was recorded. */
export function previousTokenHtml(exampleData: Record<string, unknown> | null | undefined): string | null {
  const prev = exampleData?.[PREV_HTML_KEY];
  return typeof prev === "string" && prev.length > 0 ? prev : null;
}

/**
 * Builds the `example_data` to store when replacing a page's markup: the new
 * values MERGED over the old ones — so keys written by other passes survive
 * (`__var_mapping`, set by the bracket-mapping routes, used to be destroyed on
 * every re-import) — plus the outgoing markup kept for one generation.
 */
export function nextExampleData(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
  replacedHtml: string | null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(previous ?? {}), ...next };
  if (replacedHtml) merged[PREV_HTML_KEY] = replacedHtml;
  return merged;
}
