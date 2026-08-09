import { SITE_DOMAIN } from "@/lib/site-domain";

/**
 * L'URL publique d'un rapport.
 *
 * Un module à part, minuscule et sans `server-only` : elle est produite côté
 * serveur (routes API) et lue côté navigateur (le dialogue de partage, la
 * messagerie). Les deux DOIVENT s'accorder avec `PUBLIC_SUBDOMAINS` du
 * middleware — c'est exactement le genre de constante qui, dupliquée, finit par
 * diverger et par produire des liens morts envoyés à des prospects.
 */
export function rapportPublicUrl(token: string): string {
  return `https://rapport.${SITE_DOMAIN}/${token}`;
}
