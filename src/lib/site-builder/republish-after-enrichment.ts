/**
 * Republication des sites publiés après un (ré)enrichissement.
 *
 * `publishSite` fige les variables résolues dans `published_variables`, et le
 * rendu public refuse tout repli sur les données vives (`site-resolver.ts` :
 * verrou strict d'instantané, volontaire — un site en ligne ne doit pas changer
 * sous les pieds de son visiteur parce qu'une ligne a bougé en base).
 *
 * Conséquence non voulue : enrichir une entreprise APRÈS la publication de son
 * site ne changeait rien en ligne. La fiche affichait des chiffres clés
 * complets, le site déployé restait vide, et rien ne le signalait. L'opérateur
 * devait savoir qu'il fallait republier à la main.
 *
 * On referme la boucle ici : dès qu'un enrichissement réussit, les sites
 * PUBLIÉS de l'entreprise sont republiés avec leur destination actuelle
 * (sous-domaine / domaine inchangés). Best-effort et jamais bloquant : un échec
 * de republication est journalisé, l'enrichissement reste un succès.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishSite } from "./publish-site";

export interface RepublishOutcome {
  /** Sites republiés avec succès. */
  republished: string[];
  /** Sites dont la republication a échoué (id → raison). */
  failed: Array<{ siteId: string; error: string }>;
}

const EMPTY: RepublishOutcome = { republished: [], failed: [] };

type SiteSlice = {
  id: string;
  published_subdomain: string | null;
  published_domain: string | null;
};

/**
 * Republie les sites publiés liés aux projets donnés (via leur entreprise ou le
 * lien direct site → projet). Ne throw jamais.
 */
export async function republishSitesForProjects(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<RepublishOutcome> {
  const ids = [...new Set((projectIds ?? []).filter(Boolean))];
  if (ids.length === 0) return EMPTY;

  try {
    const { data: projects } = await supabase
      .from("lead_magnet_projects")
      .select("id, entreprise_id")
      .in("id", ids);

    const enterpriseIds = [
      ...new Set(
        ((projects ?? []) as Array<{ entreprise_id: number | null }>)
          .map((p) => p.entreprise_id)
          .filter((v): v is number => typeof v === "number"),
      ),
    ];

    // Un site peut être rattaché par son entreprise OU par le lien direct au
    // projet : on couvre les deux, dédoublonné par id.
    const queries = [
      supabase
        .from("sites")
        .select("id, published_subdomain, published_domain")
        .eq("is_published", true)
        .in("lead_magnet_project_id", ids),
      enterpriseIds.length > 0
        ? supabase
            .from("sites")
            .select("id, published_subdomain, published_domain")
            .eq("is_published", true)
            .in("enterprise_id", enterpriseIds)
        : Promise.resolve({ data: [] as SiteSlice[] }),
    ];
    const results = await Promise.all(queries);

    const byId = new Map<string, SiteSlice>();
    for (const res of results) {
      for (const site of ((res as { data: SiteSlice[] | null }).data ?? [])) {
        if (site?.id) byId.set(site.id, site);
      }
    }
    if (byId.size === 0) return EMPTY;

    const outcome: RepublishOutcome = { republished: [], failed: [] };
    for (const site of byId.values()) {
      // Republier, c'est réécrire l'instantané SUR PLACE : on repasse la
      // destination actuelle, jamais une nouvelle. Sans destination connue, le
      // site n'est pas réellement joignable — on le laisse tranquille.
      if (!site.published_subdomain && !site.published_domain) continue;
      try {
        const res = await publishSite(supabase, site.id, {
          subdomain: site.published_subdomain ?? undefined,
          domain: site.published_domain ?? undefined,
        });
        if (res.ok) outcome.republished.push(site.id);
        else outcome.failed.push({ siteId: site.id, error: res.error ?? "publish_failed" });
      } catch (e) {
        outcome.failed.push({ siteId: site.id, error: e instanceof Error ? e.message : "publish_threw" });
      }
    }

    if (outcome.failed.length > 0) {
      console.warn("[republish-after-enrichment] échecs", outcome.failed);
    }
    return outcome;
  } catch (e) {
    // L'enrichissement a réussi : ce n'est pas à lui de tomber parce que la
    // republication n'a pas abouti.
    console.warn("[republish-after-enrichment] abandon", e instanceof Error ? e.message : e);
    return EMPTY;
  }
}
