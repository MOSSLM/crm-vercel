import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureHostedLogo } from "@/lib/site-builder/ensure-hosted-logo";
import { resolveEnterpriseVariables } from "@/lib/site-builder/resolve-variables";
import { UNDEFINED_COLUMN, missingColumnFrom, type PgErrorLike } from "@/lib/schema-drift";
import { canonicalizeDomain } from "@/lib/url-canonical";

export interface PublishSiteResult {
  ok: boolean;
  site?: unknown;
  error?: string;
  status?: number;
  publishedSubdomain?: string | null;
  publishedDomain?: string | null;
  /**
   * Les destinations AVANT cette publication. Sans elles l'appelant ne peut ni
   * purger le cache de l'ancienne adresse, ni y poser une redirection, ni
   * détacher le domaine côté hébergeur : il ne sait pas ce qu'il vient de
   * remplacer.
   */
  ancienneDestination?: { subdomain: string | null; domain: string | null };
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

  // On NORMALISE ici, on ne rejette pas — et c'est délibéré.
  //
  // Deux appelants (`rebuild-site-from-template`, `republish-after-enrichment`)
  // réinjectent la valeur ACTUELLE de published_domain au lieu d'une nouvelle,
  // et le parc contient des valeurs préfixées par le protocole (cf. l'en-tête de
  // demo-share-url.ts, et les cinq lecteurs qui font `startsWith("http")` pour
  // s'en accommoder). Une regex qui rejette ici rendrait un site parfaitement en
  // ligne impossible à reconstruire, pour un défaut de forme d'une valeur écrite
  // il y a des mois — et `rebuild-site-from-template` remonte l'erreur au caller.
  //
  // Le REJET d'une saisie mal formée appartient à la route qui reçoit l'opérateur
  // (isPlausibleDomain, src/lib/archive/reasons.ts). Ici, la seule règle est que
  // ce qui part en base doit avoir la forme comparée à la lecture : minuscules,
  // sans protocole, sans port, sans chemin, sans `www.`.
  const domaineNormalise = domain ? canonicalizeDomain(domain) || null : null;

  const [{ data: currentSite }, { data: currentInstances }] = await Promise.all([
    supabase
      .from("sites")
      .select("style_guide, sitemap, site_config, enterprise_id, lead_magnet_project_id, content_overrides, shared_assets, tweaks, published_subdomain, published_domain")
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
    // La capture est invalidée avec la carte : elle montrerait l'état d'AVANT
    // la republication, ce qui est précisément ce qu'on vient de corriger.
    og_image_url: null,
    og_shot_url: null,
    og_generated_at: null,
  };
  if (subdomain) updatePayload.published_subdomain = subdomain;
  // `!== undefined` et non `if (domain)` : sans cette distinction, passer `null`
  // laissait la colonne intacte et AUCUN chemin du dépôt ne pouvait remettre
  // published_domain à NULL. Le miroir était irréversible — donc un client qui
  // part, transfère son domaine ou le laisse expirer restait annoncé par le CRM
  // comme l'adresse publique de son site, potentiellement vers un repreneur.
  if (domain !== undefined) updatePayload.published_domain = domaineNormalise;

  const { data, error } = await updateDroppingMissingColumns(supabase, siteId, updatePayload);

  if (error) {
    if (error.code === "23505") {
      // Deux index uniques peuvent produire un 23505 sur cet UPDATE depuis la
      // migration 20260812. Annoncer « sous-domaine » dans les deux cas
      // envoyait l'opérateur corriger le mauvais champ.
      const detail = (error as { details?: string | null }).details ?? "";
      const surLeDomaine = /published_domain/i.test(`${error.message} ${detail}`);
      return surLeDomaine
        ? { ok: false, error: `Le domaine ${domaineNormalise} est déjà rattaché à un autre site`, status: 409 }
        : { ok: false, error: "Ce sous-domaine est déjà utilisé par un autre site", status: 409 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const ligne = data as { published_subdomain?: string | null; published_domain?: string | null } | null;
  return {
    ok: true,
    site: data,
    publishedSubdomain: ligne?.published_subdomain ?? subdomain ?? null,
    publishedDomain: ligne?.published_domain ?? domaineNormalise,
    ancienneDestination: {
      subdomain: (currentSite as { published_subdomain?: string | null } | null)?.published_subdomain ?? null,
      domain: (currentSite as { published_domain?: string | null } | null)?.published_domain ?? null,
    },
    ...(logo.warnings.length ? { warnings: logo.warnings } : {}),
  };
}

/**
 * `update` sur `sites`, en retirant les colonnes que CET environnement n'a pas.
 *
 * Pendant sur le chemin d'écriture de `selectDroppingMissingColumns`, et pour la
 * même raison — les migrations s'appliquent à la main, donc un environnement
 * traîne régulièrement d'une colonne. La différence est que l'écriture est plus
 * dangereuse que la lecture : un `update` qui nomme une colonne absente échoue
 * ENTIÈREMENT, et ici cela rendrait tout site impubliable. C'est exactement le
 * scénario qui avait déjà mis tous les sites hors ligne (une seule colonne
 * manquante, `paywall_enabled`, cf. `docs/site-builder-v2.md`).
 *
 * Les colonnes retirées ici ne portent que la carte de partage : la perdre
 * dégrade la vignette WhatsApp, elle n'empêche rien.
 */
async function updateDroppingMissingColumns(
  supabase: SupabaseClient,
  siteId: string,
  payload: Record<string, unknown>,
): Promise<{ data: unknown; error: PgErrorLike | null }> {
  const remaining = { ...payload };

  for (;;) {
    const { data, error } = await supabase
      .from("sites")
      .update(remaining)
      .eq("id", siteId)
      .select()
      .single();

    if (!error || error.code !== UNDEFINED_COLUMN) return { data, error };

    const missing = missingColumnFrom(error.message);
    if (!missing || !(missing in remaining)) return { data, error };

    delete remaining[missing];
    console.warn(
      `[publish-site] colonne « ${missing} » absente de la base — publication ` +
        `poursuivie sans elle (migration SQL non appliquée sur cet environnement).`,
    );
    if (Object.keys(remaining).length === 0) return { data, error };
  }
}
