/**
 * Which page a draft/template preview should actually render.
 *
 * A Claude Design's page slugs come from the imported file names
 * (`fileNameToSlug`: index.html → "/", a-propos.html → "/a-propos"), so a design
 * whose ZIP has no index.html has NO page at "/". The preview subdomain
 * ({uuid}.{SITE_DOMAIN}) always lands on "/", which used to 404 outright even
 * though the design rendered fine in the editor.
 *
 * So: an explicitly requested page that doesn't exist stays a 404, but the bare
 * root falls back to the first renderable page. The fallback is deliberately
 * confined to the preview — on a published site a missing page must keep
 * returning a real 404.
 */

export interface PreviewInstanceRef {
  page_slug: string;
  is_hidden?: boolean | null;
}

export interface ResolvedPreviewSlug {
  slug: string;
  /** True when `slug` is a stand-in for a "/" that doesn't exist. */
  fellBack: boolean;
}

/**
 * @param instances  live section instances of the site
 * @param sitemap    the site's sitemap, used only to order fallback candidates
 *                   the way the operator sees them in the builder
 * @param requested  slug asked for by the URL ("/" for the bare subdomain)
 * @param isAllowed  optional gate (service-tag filtering) applied to fallback
 *                   candidates so we never land on a page we'd then 404 on
 * @returns the slug to render, or null when nothing can be rendered
 */
export function resolvePreviewSlug(
  instances: readonly PreviewInstanceRef[],
  sitemap: ReadonlyArray<{ slug: string }> | null | undefined,
  requested: string,
  isAllowed: (slug: string) => boolean = () => true,
): ResolvedPreviewSlug | null {
  const visible = instances.filter((i) => !i.is_hidden);

  if (visible.some((i) => i.page_slug === requested)) {
    return { slug: requested, fellBack: false };
  }
  if (requested !== "/") return null;

  const ordered = (sitemap ?? []).map((p) => p.slug);
  const fromSitemap = ordered.find(
    (slug) => isAllowed(slug) && visible.some((i) => i.page_slug === slug),
  );
  if (fromSitemap) return { slug: fromSitemap, fellBack: true };

  // Sitemap empty or out of sync with the instances — take the first renderable
  // instance rather than 404 on a design that plainly has pages.
  const fromInstances = visible.find((i) => isAllowed(i.page_slug));
  return fromInstances ? { slug: fromInstances.page_slug, fellBack: true } : null;
}
