import { SITE_DOMAIN } from "@/lib/site-domain";

/**
 * L'adresse OFFICIELLE d'un site publié — celle qu'on déclare à Google.
 *
 * À ne pas confondre avec `origineRequete()`, et c'est tout l'enjeu de ce
 * module. Les deux notions ont été fondues en un seul paramètre dans
 * `buildPageMetadata`, ce qui rendait le canonical inutile :
 *
 *   - `origineRequete()` rend l'origine DEMANDÉE. C'est le bon choix pour la
 *     carte OpenGraph — servir l'image depuis le même hôte que la page qui la
 *     déclare, parce qu'un robot d'unfurl capable de charger la page l'est
 *     forcément aussi de charger l'image (cf. l'en-tête de build-page-metadata).
 *   - le canonical, lui, doit être IDENTIQUE quel que soit l'hôte emprunté.
 *     Bâti sur l'origine demandée, chaque espace d'URL se déclarerait canonique
 *     de lui-même : Google verrait deux sites complets, dupliqués page à page,
 *     chacun s'auto-désignant, et aucune déduplication ne se produirait.
 *
 * Ce que ça coûte de se tromper : le sous-domaine `{label}.{SITE_DOMAIN}` reste
 * servi après l'attachement d'un domaine client (rien ne le dépublie), donc les
 * deux hôtes rendent les mêmes pages. Sans canonical, Google peut retenir le
 * NÔTRE — et le client paierait un domaine dont les pages sont indexées sous la
 * marque de l'agence. C'est l'objectif même de la fonctionnalité qui se
 * retourne.
 *
 * Le domaine propre gagne dès qu'il existe : c'est ce que le client a acheté.
 */
export interface SiteAdressable {
  publishedDomain?: string | null;
  publishedSubdomain?: string | null;
}

export function hostCanoniqueDuSite(site: SiteAdressable): string | null {
  const domaine = site.publishedDomain?.trim();
  if (domaine) return domaine.startsWith("http") ? domaine : `https://${domaine}`;
  const label = site.publishedSubdomain?.trim();
  if (label) return `https://${label}.${SITE_DOMAIN}`;
  // Un aperçu de brouillon n'a pas d'adresse officielle : mieux vaut n'émettre
  // aucun canonical qu'en émettre un faux.
  return null;
}

/** L'URL canonique d'une page donnée du site. `pageSlug` est « / » ou « /contact ». */
export function urlCanonique(site: SiteAdressable, pageSlug: string): string | null {
  const host = hostCanoniqueDuSite(site);
  if (!host) return null;
  const chemin = !pageSlug || pageSlug === "/" ? "/" : `/${pageSlug.replace(/^\/+/, "")}`;
  return `${host}${chemin}`;
}
