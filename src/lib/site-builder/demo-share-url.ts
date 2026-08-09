import { SITE_DOMAIN } from "@/lib/site-domain";

/**
 * L'URL qu'on envoie au prospect pour lui montrer sa démo.
 *
 * Deux hôtes possibles, et la distinction compte : tant que le site n'est pas
 * déployé, le lien partagé est l'aperçu `{siteId}.{SITE_DOMAIN}` — une bonne
 * part des liens réellement envoyés. C'est précisément la route qui n'exportait
 * aucune métadonnée sociale et s'affichait en URL nue sur WhatsApp.
 *
 * Cette fonction existait en double, copiée verbatim dans `SiteKanban` et dans
 * la fiche entreprise de l'espace agent. Les deux copies devaient rester
 * d'accord avec le middleware (`src/middleware.ts`) et avec la route OG, ce qui
 * fait trois endroits à corriger ensemble : d'où ce module unique.
 */

/** Le strict nécessaire : les deux formes de ligne `sites` qu'on rencontre. */
export interface DemoLike {
  id: string;
  published_subdomain?: string | null;
}

export function demoShareUrl(demo: DemoLike): string {
  return demo.published_subdomain
    ? `https://${demo.published_subdomain}.${SITE_DOMAIN}`
    : `https://${demo.id}.${SITE_DOMAIN}`;
}

/** Vrai quand le lien partagé est l'aperçu brouillon et non le site publié. */
export function isDraftShareUrl(demo: DemoLike): boolean {
  return !demo.published_subdomain;
}
