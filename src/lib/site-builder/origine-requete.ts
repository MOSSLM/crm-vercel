import { headers } from "next/headers";

/**
 * L'origine réellement demandée par le visiteur — `https://{hôte}`.
 *
 * POURQUOI ON LA LIT DANS L'EN-TÊTE plutôt que de la reconstruire.
 *
 * Une même page est servie sous trois hôtes différents selon le cas :
 * `{sous-domaine}.samadigitalstudio.fr` pour un site déployé, le domaine du
 * client pour un site sur son propre nom, `{uuid}.samadigitalstudio.fr` pour un
 * aperçu brouillon. Reconstruire l'URL depuis les données du site obligerait à
 * refaire ce choix à chaque appelant — et à se tromper une fois sur trois.
 *
 * L'intérêt est concret : la carte de partage est alors servie depuis le MÊME
 * hôte que la page qui la déclare. Un robot de messagerie capable de charger la
 * page l'est forcément aussi de charger l'image, ce qui n'était pas garanti
 * quand elle vivait sur l'hôte du CRM. Et le prospect qui inspecte le lien ne
 * voit qu'un seul domaine, le sien.
 *
 * Renvoie `null` hors contexte de requête ; l'appelant retombe alors sur
 * `getAppUrl()`.
 */
export async function origineRequete(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (!host) return null;
    // Le protocole vient du proxy : en local on sert en clair, en production
    // Vercel termine le TLS et l'annonce ici.
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}
