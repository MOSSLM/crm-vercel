/**
 * Le prix du site, calculé pour CE prospect.
 *
 * LA RÈGLE, telle que Matteo la formule : « à partir de 490 € pour l'accueil
 * plus une page service, et 50 € par page service supplémentaire ». Le montant
 * n'est donc plus un plancher qu'on répète à tout le monde — c'est le prix du
 * site qu'on lui a effectivement préparé.
 *
 * ON NE COMPTE PAS LES PAGES DU GABARIT, ON COMPTE LES SIENNES. Le générateur
 * de démo pose TOUJOURS les neuf mêmes pages de service : les 256 sites publiés
 * portent exactement le même plan, sans une seule exception. Compter les pages
 * du plan donnerait donc 890 € à tout le monde, et « à partir de 490 € »
 * deviendrait faux pour cent pour cent des prospects.
 *
 * Ce qui varie, c'est ce que l'entreprise fait RÉELLEMENT — et le CRM le sait
 * déjà : `serviceTagGate` masque toute page dont le service n'est pas dans
 * `entreprises.service_tags`. Une page masquée n'est pas livrée, donc pas
 * facturée. Compter l'intersection, c'est compter les pages que le prospect
 * voit quand il ouvre sa démo. Les deux chiffres ne peuvent pas diverger,
 * puisqu'ils viennent de la même règle.
 *
 * ET C'EST CE QUI FILTRE LE BRUIT D'ANNUAIRE. `service_tags` porte aussi les
 * catégories Google Business (« Fournisseur de systèmes de climatisation »,
 * « Magasin d'électroménager »…), qui ne pilotent aucune page. Comptées, elles
 * annonceraient 1 090 € à deux prospects sur quarante, sur la foi d'étiquettes
 * de scraping que personne n'a validées. Hors taxonomie ⇒ hors facture.
 *
 * LE MONTANT DE BASE VIENT DU CATALOGUE, JAMAIS D'UNE CONSTANTE. C'est la règle
 * de toute la plaquette, et elle a été payée : quatre audits en base annoncent
 * encore 1 490 € et 89 €/mois parce qu'ils ont figé leur grille le jour de leur
 * création. Le seul nombre écrit ici est un REPLI, pour le cas où le catalogue
 * est injoignable.
 */

import { SERVICE_TAGS_TAXONOMY, serviceTagKey } from "@/utils/serviceTags";
import type { OffreAudit } from "@/lib/audit/offres-audit";

/**
 * Ce que le prix de base couvre déjà : l'accueil, plus UNE page de service.
 * L'accueil n'entre pas dans le compte — il n'est jamais optionnel.
 */
export const PAGES_SERVICE_INCLUSES = 1;

/** Repli si le catalogue ne dit pas le pas. Cf. l'en-tête : c'est un repli. */
export const PRIX_PAGE_SERVICE_DEFAUT = 50;

/** Les neuf services que le gabarit sait rendre, en cles canoniques. */
const CLES_DU_GABARIT: ReadonlySet<string> = new Set(
  SERVICE_TAGS_TAXONOMY.map((t) => serviceTagKey(t)),
);

/**
 * Combien de pages de service ce prospect aura vraiment.
 *
 * Dédoublonné par cle canonique : « Climatisation » et « climatisation » sont
 * la même page, et une fiche qui porte les deux ne doit pas la payer deux fois.
 * Jamais moins d'une — une entreprise dont aucun tag n'est reconnu reçoit
 * quand même un site avec une page de service, donc le prix plancher.
 */
export function pagesServiceFacturables(serviceTags: unknown): number {
  const liste = Array.isArray(serviceTags) ? serviceTags : [];
  const cles = new Set<string>();
  for (const tag of liste) {
    if (typeof tag !== "string") continue;
    const cle = serviceTagKey(tag);
    if (cle && CLES_DU_GABARIT.has(cle)) cles.add(cle);
  }
  return Math.max(cles.size, PAGES_SERVICE_INCLUSES);
}

/** Le socle du catalogue — la seule offre dont le prix fait le prix du site. */
export const socleDe = (offres: readonly OffreAudit[]): OffreAudit | null =>
  offres.find((o) => o.role === "socle") ?? null;

/**
 * Le prix du site pour ce nombre de pages de service.
 *
 * Rend `null` quand le catalogue n'a pas de socle : mieux vaut une plaquette
 * qui n'annonce aucun prix qu'une plaquette qui en annonce un faux. L'appelant
 * décide alors quoi afficher — c'est lui qui connaît son gabarit.
 */
export function prixDuSite(offres: readonly OffreAudit[], pagesService: number): number | null {
  const socle = socleDe(offres);
  if (!socle || !Number.isFinite(socle.prixHt) || socle.prixHt <= 0) return null;
  const pas = socle.prixPageService ?? PRIX_PAGE_SERVICE_DEFAUT;
  const supplementaires = Math.max(0, Math.round(pagesService) - PAGES_SERVICE_INCLUSES);
  return Math.round(socle.prixHt + pas * supplementaires);
}

/**
 * « 590 € », « 1\u00A0090 € ».
 *
 * Les espaces sont ÉCRITES EN ÉCHAPPEMENT, jamais tapées. Une espace
 * insécable au milieu d'un littéral est invisible en relecture et se fait
 * remplacer par une espace ordinaire au premier copier-coller — le document
 * coupe alors sa ligne entre le montant et sa devise, et personne ne sait
 * pourquoi. `toLocaleString` est écarté pour une raison voisine : selon la
 * version d'ICU il rend l'espace fine insécable U+202F ou l'insécable U+00A0,
 * si bien que le même code ne produit pas le même texte sur deux machines.
 */
export const formatPrixEuros = (montant: number): string => {
  const entier = String(Math.abs(Math.round(montant)));
  const milliers = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return `${montant < 0 ? "-" : ""}${milliers}\u00A0\u20AC`;
};

/**
 * Le montant tel qu'il s'écrit sur la plaquette de CE prospect.
 *
 * Un seul point d'entrée, pour que la page tarifaire et le message qui la
 * porte ne puissent pas annoncer deux montants différents.
 */
export function prixPlaquette(
  offres: readonly OffreAudit[],
  serviceTags: unknown,
): { pages: number; montant: number; texte: string } | null {
  const pages = pagesServiceFacturables(serviceTags);
  const montant = prixDuSite(offres, pages);
  if (montant == null) return null;
  return { pages, montant, texte: formatPrixEuros(montant) };
}
