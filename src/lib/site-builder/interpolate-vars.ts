/**
 * Replaces `{{ variable }}` tokens with values from a flat variable map.
 *
 * Shared by the override applicators (apply-overrides-html, hydrator, iframe)
 * and SEO metadata generation so meta title/description/og fields support the
 * same `{{ entreprise.nom }}` substitution as section content. Unknown tokens
 * resolve to an empty string. Pure (no server-only deps) so it can run in both
 * server components (generateMetadata) and the browser.
 */
export function interpolateVars(text: string, variables: Record<string, string>): string {
  if (typeof text !== "string" || !text) return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = variables[key];
    return v != null ? v : "";
  });
}
