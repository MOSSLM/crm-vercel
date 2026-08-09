import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureHostedLogo } from "@/lib/site-builder/ensure-hosted-logo";
import { resolveEnterpriseVariables } from "@/lib/site-builder/resolve-variables";
import { updateDroppingMissingColumns } from "@/lib/schema-drift";

export interface PublishSiteResult {
  ok: boolean;
  site?: unknown;
  error?: string;
  status?: number;
  publishedSubdomain?: string | null;
  /**
   * Anomalies non bloquantes, à montrer dans l'éditeur du CRM — jamais dans le
   * site publié. Aujourd'hui : un logo qu'on n'a pas pu rapatrier.
   */
  warnings?: string[];
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

  // AVANT de résoudre les variables : l'instantané fige `entreprise.logo_url`,
  // donc c'est le dernier moment où l'on peut encore garantir que le logo servi
  // vient de chez nous et non du site du client. Ne bloque jamais la
  // publication — au pire, on publie comme avant et le motif remonte.
  const logo = await ensureHostedLogo(supabase, {
    enterpriseId: siteSlice?.enterprise_id ?? null,
    projectId: siteSlice?.lead_magnet_project_id ?? null,
  });

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
    // Carte de partage : on INVALIDE, on ne régénère pas.
    //
    // Régénérer ici coûterait une capture — plusieurs secondes — et
    // `publishSite` est appelé EN BOUCLE par `deploy-batch`. Publier 50 sites
    // partirait droit en timeout, pour une image que personne ne regarde encore.
    // La fabrication a lieu à l'ouverture du dialogue « Partager », c'est-à-dire
    // juste avant l'envoi, et le cron ramasse ce qui reste.
    //
    // Les captures sont invalidées avec la carte : elles montreraient l'état
    // d'AVANT la republication, ce qui est précisément ce qu'on vient de
    // corriger. LES DEUX, ordinateur ET téléphone : n'en invalider qu'une
    // fabriquait une carte mi-figue mi-raisin, mockup à jour et téléphone
    // périmé côte à côte, ce qui est plus trompeur que deux images anciennes.
    //
    // Le logo, lui, n'est pas invalidé ici — son dérivé porte l'empreinte de sa
    // source (`ensure-og-logo`), donc il se refait tout seul quand le logo du
    // client change, et pas à chaque republication.
    og_image_url: null,
    og_shot_url: null,
    og_shot_mobile_url: null,
    og_shot_at: null,
    og_generated_at: null,
  };
  if (subdomain) updatePayload.published_subdomain = subdomain;
  if (domain) updatePayload.published_domain = domain;

  const { data, error } = await updateDroppingMissingColumns(
    updatePayload,
    (patch) => supabase.from("sites").update(patch).eq("id", siteId).select().single(),
    (colonne) =>
      console.warn(
        `[publish-site] colonne « ${colonne} » absente de la base — publication ` +
          `poursuivie sans elle (migration SQL non appliquée sur cet environnement).`,
      ),
  );

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ce sous-domaine est déjà utilisé par un autre site", status: 409 };
    return { ok: false, error: error.message, status: 500 };
  }

  return {
    ok: true,
    site: data,
    publishedSubdomain: (data as { published_subdomain?: string | null } | null)?.published_subdomain ?? subdomain ?? null,
    ...(logo.warnings.length ? { warnings: logo.warnings } : {}),
  };
}

