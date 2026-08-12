import { serviceTagGate } from "@/utils/serviceTags";
import type { SitemapPage } from "@/types";

/**
 * Quelles pages ce site sert-il RÉELLEMENT.
 *
 * Existe pour une raison précise : un sitemap.xml bâti sur `published_sitemap`
 * listerait des URLs qui rendent 404. Le rendu applique trois conditions que le
 * plan du site ne porte pas —
 *
 *   1. la page doit figurer au plan du site ;
 *   2. une page tagguée d'un service que l'entreprise n'a pas est masquée
 *      (landing pages par service) ;
 *   3. une page sans section est une CATÉGORIE, pas une page — « /services »
 *      n'est qu'un menu déroulant non cliquable.
 *
 * Les deux dernières sont routinières. Livrer à Google un sitemap dont une part
 * des URLs répond 404 dégrade la confiance de crawl sur tout le domaine — et
 * cette fois c'est le domaine du CLIENT.
 *
 * D'où une seule expression de la règle, appelée par le rendu (SitePageView) ET
 * par le sitemap. Si les deux divergent, c'est ce module qu'on corrige.
 */
export interface InstancePubliee {
  page_slug: string;
  is_hidden?: boolean;
}

export interface EtatPublie {
  sitemap: SitemapPage[] | null | undefined;
  instances: InstancePubliee[];
  enterpriseTags: readonly string[];
}

/** Parse the enterprise service tags from the resolved variables map. */
export function parseEnterpriseTags(variables: Record<string, string>): string[] {
  try {
    const parsed = JSON.parse(variables["__service_tags"] ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function pageEstServie(pageSlug: string, etat: EtatPublie): boolean {
  const { sitemap, instances, enterpriseTags } = etat;
  const estAccueil = pageSlug === "/";
  const cible = sitemap?.find((p) => p.slug === pageSlug);

  // A non-home page must exist in the sitemap.
  if (!estAccueil && !cible) return false;
  // Comparé via serviceTagGate : le tag de la page est l'ASCII de son nom de
  // fichier (« pompe-a-chaleur »), celui de l'entreprise le libellé CRM
  // (« pompe à chaleur »).
  if (!serviceTagGate(enterpriseTags)(cible?.service_tag)) return false;
  // A page with no sections is a category, not a real page.
  if (!instances.some((i) => i.page_slug === pageSlug && !i.is_hidden)) return false;
  return true;
}

/** Tous les chemins servis, l'accueil en tête. */
export function slugsServis(etat: EtatPublie): string[] {
  const candidats = ["/", ...(etat.sitemap ?? []).map((p) => p.slug).filter(Boolean)];
  return Array.from(new Set(candidats)).filter((slug) => pageEstServie(slug, etat));
}
