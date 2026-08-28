/**
 * Le boost SEO local : ce que coûte UNE PAGE PAR SERVICE ET PAR COMMUNE.
 *
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL CORRIGE. La plaquette promettait
 * « une page par métier ET PAR COMMUNE que vous couvrez » dans le prix du site.
 * C'était une promesse qu'on ne tient pas : le générateur pose une page par
 * service, pas le produit cartésien des services par les communes. Trente
 * communes pour un chauffagiste à trois métiers, ce sont quatre-vingt-dix pages
 * à écrire — un autre travail, et donc un autre produit. Le socle vend
 * désormais ses pages de service ; les communes sont ce fichier.
 *
 * LE PRIX EST DÉGRESSIF PAR TRANCHES, ET C'EST LE POINT. Un barème à prix
 * unique rendrait la troisième commune aussi chère que la trentième, alors que
 * c'est exactement l'inverse qu'on veut vendre : plus la zone est large, moins
 * la page coûte. Les tranches se cumulent comme un barème d'imposition — les
 * cinquante premières pages au premier prix, les suivantes au deuxième — et
 * jamais « toutes les pages au prix de la dernière tranche », qui ferait
 * BAISSER la facture en ajoutant des pages.
 *
 * IL S'ADAPTE AU PROSPECT PAR SES MÉTIERS, ET C'EST LA MÊME DÉFINITION QUE LE
 * SITE. Le nombre de pages vendues est `pagesServiceFacturables × communes` :
 * on réutilise la fonction du prix du site plutôt que de recompter ici, sans
 * quoi la page 4 et la page 5 de la plaquette annonceraient deux nombres de
 * métiers différents pour le même prospect, sur deux écrans qui se suivent.
 *
 * LA GRILLE VIT DANS LE CODE, ET C'EST LA SEULE DE LA PLAQUETTE. Tout le reste
 * vient du catalogue d'offres (cf. l'en-tête de `prix-site.ts` : quatre audits
 * en base annoncent encore un tarif de 2025 pour l'avoir figé). Il n'y a
 * simplement AUCUNE ligne `offres` pour ce produit — le jour où elle existera,
 * c'est ici qu'elle se branche, et ces constantes redeviendront des replis.
 */

import { formatPrixEuros, pagesServiceFacturables } from "@/lib/audit/prix-site";

/** Une tranche du barème : jusqu'à `jusqua` pages, chaque page coûte `prixPage`. */
export interface TrancheSeoLocal {
  jusqua: number;
  prixPage: number;
}

/**
 * Le barème, du plus cher au moins cher. La dernière tranche n'a pas de
 * plafond : une entreprise à neuf métiers sur trente communes fait 270 pages,
 * et un barème qui s'arrêterait avant rendrait un prix faux sans le dire.
 */
export const TRANCHES_SEO_LOCAL: readonly TrancheSeoLocal[] = [
  { jusqua: 50, prixPage: 25 },
  { jusqua: 150, prixPage: 18 },
  { jusqua: Number.POSITIVE_INFINITY, prixPage: 12 },
];

/**
 * Les trois formules montrées sur la plaquette. Trois et pas cinq : c'est un
 * écran de téléphone, et un tableau qu'on fait défiler ne se lit pas.
 */
export const COMMUNES_DES_BUNDLES: readonly number[] = [10, 20, 30];

/**
 * Ce que coûtent `pages` pages, barème cumulé.
 *
 * Le cumul est ce qui rend le prix monotone : chaque page ajoutée coûte le prix
 * de SA tranche, jamais moins que la précédente au total. Un barème plat par
 * palier ferait payer 51 pages moins cher que 50 dès que le palier suivant est
 * mieux négocié, et le prospect qui le remarque n'achète plus rien.
 */
export function prixPagesSeoLocal(pages: number): number {
  const total = Math.max(0, Math.round(pages));
  let reste = total;
  let plancher = 0;
  let montant = 0;
  for (const tranche of TRANCHES_SEO_LOCAL) {
    if (reste <= 0) break;
    const capacite = tranche.jusqua - plancher;
    const prises = Math.min(reste, capacite);
    montant += prises * tranche.prixPage;
    reste -= prises;
    plancher = tranche.jusqua;
  }
  return Math.round(montant);
}

/** Une formule, telle qu'elle s'écrit sur la plaquette. */
export interface PalierSeoLocal {
  /** Combien de communes cette formule couvre. */
  communes: number;
  /** Les pages que ça fait POUR CE PROSPECT : ses métiers × ses communes. */
  pages: number;
  montant: number;
  /** Le montant déjà formaté — même fonction que le prix du site. */
  texte: string;
}

/** Le boost tel que le gabarit l'attend : le nombre de métiers, et trois formules. */
export interface BoostSeoLocal {
  /** Les métiers facturables du prospect — la même mesure que le prix du site. */
  pagesService: number;
  paliers: PalierSeoLocal[];
}

/**
 * Le boost de CE prospect, calculé depuis ses étiquettes de service.
 *
 * Toujours rendu, jamais `null` : `pagesServiceFacturables` ne descend jamais
 * sous un métier, et la grille ne dépend pas du catalogue. C'est ce qui permet
 * au gabarit de ne pas porter de variante vide — un écran de plaquette qui
 * n'aurait rien à dire vaudrait mieux supprimé.
 */
export function boostSeoLocal(serviceTags: unknown): BoostSeoLocal {
  const pagesService = pagesServiceFacturables(serviceTags);
  return {
    pagesService,
    paliers: COMMUNES_DES_BUNDLES.map((communes) => {
      const pages = pagesService * communes;
      const montant = prixPagesSeoLocal(pages);
      return { communes, pages, montant, texte: formatPrixEuros(montant) };
    }),
  };
}
