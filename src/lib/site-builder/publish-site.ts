import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEnterpriseVariables } from "@/lib/site-builder/resolve-variables";

export interface PublishSiteResult {
  ok: boolean;
  site?: unknown;
  error?: string;
  status?: number;
  publishedSubdomain?: string | null;
}

/**
 * Publishes a site: snapshots its current style_guide / sitemap / site_config /
 * section instances + resolved enterprise variables & reviews into the
 * `published_*` columns and flips `is_published`.
 *
 * Extracted from the publish route so both it and the bulk deploy endpoint
 * share one snapshot implementation. Callers handle revalidatePath() (a Next
 * server-only concern). The snapshot reads `site_section_instances`, so any
 * cloned instances must already be inserted before calling this.
 */
export async function publishSite(
  supabase: SupabaseClient,
  siteId: string,
  opts: { subdomain?: string; domain?: string },
): Promise<PublishSiteResult> {
  const { subdomain, domain } = opts;
  if (!subdomain && !domain) return { ok: false, error: "subdomain ou domain requis", status: 400 };
  if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) {
    return { ok: false, error: "Le sous-domaine ne peut contenir que des lettres minuscules, chiffres et tirets", status: 400 };
  }

  const [{ data: currentSite }, { data: currentInstances }] = await Promise.all([
    supabase
      .from("sites")
      .select("style_guide, sitemap, site_config, enterprise_id, lead_magnet_project_id, content_overrides, shared_assets, tweaks")
      .eq("id", siteId)
      .single(),
    supabase
      .from("site_section_instances")
      .select("*, section_def:site_sections (*)")
      .eq("site_id", siteId)
      .order("page_slug").order("sort_order"),
  ]);

  const siteSlice = currentSite as {
    enterprise_id: number | null;
    lead_magnet_project_id: string | null;
    content_overrides: { stats?: Array<{ label: string; value: string; display_order?: number }> } | null;
  } | null;

  const { variables: publishedVariables, reviews: publishedReviews } =
    await resolveEnterpriseVariables(supabase, {
      id: siteId,
      enterprise_id: siteSlice?.enterprise_id ?? null,
      lead_magnet_project_id: siteSlice?.lead_magnet_project_id ?? null,
      content_overrides: siteSlice?.content_overrides ?? null,
    });

  const updatePayload: Record<string, unknown> = {
    is_published: true,
    published_style_guide: currentSite?.style_guide ?? null,
    published_sitemap: currentSite?.sitemap ?? null,
    published_site_config: currentSite?.site_config ?? null,
    published_instances: currentInstances ?? [],
    published_variables: publishedVariables,
    published_reviews: publishedReviews,
    // Claude Design snapshot so the deployed page serves its CSS/theme from the
    // locked snapshot (same strict-snapshot principle as the rest).
    published_shared_assets: (currentSite as { shared_assets?: unknown } | null)?.shared_assets ?? null,
    published_tweaks: (currentSite as { tweaks?: unknown } | null)?.tweaks ?? null,
    published_at: new Date().toISOString(),
  };
  if (subdomain) updatePayload.published_subdomain = subdomain;
  if (domain) updatePayload.published_domain = domain;

  const { data, error } = await supabase
    .from("sites")
    .update(updatePayload)
    .eq("id", siteId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ce sous-domaine est déjà utilisé par un autre site", status: 409 };
    return { ok: false, error: error.message, status: 500 };
  }

  return {
    ok: true,
    site: data,
    publishedSubdomain: (data as { published_subdomain?: string | null } | null)?.published_subdomain ?? subdomain ?? null,
  };
}
