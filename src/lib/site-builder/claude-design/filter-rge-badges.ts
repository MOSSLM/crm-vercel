/**
 * Les badges TEXTE de qualification, dans les templates déjà importés.
 *
 * `hydrate-certifications` traite le bandeau de LOGOS. Il ne voit pas ceci :
 *
 *   <div class="footer-labels">
 *     <span class="label-badge">RGE QualiPAC</span>
 *     <span class="label-badge">Qualibat</span>
 *     <span class="label-badge">Qualifelec</span>
 *   </div>
 *
 * Mesuré en base : **450 sections** portent ces trois badges, et les 47 qui
 * portent aussi le bandeau de logos les portent TOUTES. Conséquence directe, et
 * c'est la raison d'être de ce module : sur une entreprise dont l'ADEME confirme
 * zéro qualification, le bandeau disparaît et le pied de page continue
 * d'afficher « RGE QualiPAC · Qualibat · Qualifelec ». Le demi-correctif est
 * pire que rien — il a l'air d'avoir été vérifié.
 *
 * SOUSTRACTIF, JAMAIS SUBSTITUTIF. On retire un badge qui nomme une
 * qualification connue que l'entreprise ne détient pas. On n'en écrit aucun, on
 * n'en renomme aucun, on ne remplace pas par un texte de repli. Un tweak qui
 * porte une allégation doit se taire, pas improviser — même règle que
 * `hydrate-certifications`.
 *
 * TROIS CHOSES QU'ON NE TOUCHE PAS :
 *
 *   1. un badge qui ne correspond à AUCUNE qualification connue. « Attestation
 *      fluides n° {{ entreprise.attestation_fluides }} » est présent sur 99
 *      sections : c'est un attribut réel de l'entreprise, pas une allégation
 *      RGE. Le retirer serait effacer une information vraie.
 *   2. un badge qui nomme une qualification que l'entreprise DÉTIENT. Une
 *      entreprise qui n'a que Qualibat garde « Qualibat » et perd les deux
 *      autres.
 *   3. tout, quand rien n'est vérifié. Pas de SIRET ou ADEME jamais interrogée →
 *      on ignore, et l'ignorance n'autorise aucune modification (§A10 de la
 *      passation, décision du propriétaire).
 *
 * Pur et isomorphe, même pipeline `node-html-parser` que ses voisins.
 */
import { parse } from "node-html-parser";

import { logoPourCertificat, CLES_LOGOS } from "@/lib/donnees-publiques/rge-logos";

export type EtatRgeBadges = {
  /** L'ADEME a-t-elle réellement été interrogée pour cette entreprise ? */
  verifie: boolean;
  /** Clés de logo des qualifications VALIDES détenues ('qualipac', 'qualibat'…). */
  clesDetenues: string[];
};

/**
 * Les deux conventions reconnues.
 *
 * `.label-badge` est celle des 450 sections en base. `[data-rge-badge]` n'existe
 * dans aucun template aujourd'hui : c'est le point d'accroche explicite pour les
 * futurs designs, posé maintenant pour ne pas avoir à revenir ici.
 */
const BADGES = "[data-rge-badge], .label-badge";
const CONTENEURS = "[data-rge-badges], .footer-labels";

/**
 * Réduit un libellé à une clé comparable.
 *
 * « RGE QualiPAC » → `qualipac`, « Chauffage + » → `chauffageplus`. On retire le
 * préfixe RGE, les accents et tout ce qui n'est pas alphanumérique, parce que le
 * même certificat s'écrit « QUALIBAT-RGE » côté ADEME et « Qualibat » dans un
 * badge.
 */
const reduire = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\brge\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Les clés de logo connues, pré-réduites, pour comparer sans recalculer. */
const CLES_REDUITES = new Map(CLES_LOGOS.map((cle) => [reduire(cle), cle]));

/**
 * À quelle qualification ce libellé de badge fait-il référence ?
 *
 * `null` quand il n'en nomme aucune de connue — et c'est le cas qui protège :
 * un badge qu'on ne reconnaît pas n'est jamais retiré.
 */
export const qualificationDuBadge = (libelle: string): string | null => {
  const brut = libelle.trim();
  if (!brut) return null;
  // Un badge peut porter le nom ADEME complet (« QualiPAC module CET »).
  const parNom = logoPourCertificat(brut);
  if (parNom) return parNom;
  const reduit = reduire(brut);
  if (!reduit) return null;
  return CLES_REDUITES.get(reduit) ?? null;
};

/**
 * Retire les badges qui allèguent une qualification non détenue.
 *
 * @param html  markup brut de la section
 * @param etat  ce que l'ADEME a réellement confirmé
 */
export function filterRgeBadges(html: string, etat: EtatRgeBadges): string {
  // Sans vérification, on ne touche à rien : l'ignorance n'est pas une absence.
  if (!etat.verifie) return html;
  if (!html.includes("label-badge") && !html.includes("data-rge-badge")) return html;

  const root = parse(html);
  const badges = root.querySelectorAll(BADGES);
  if (badges.length === 0) return html;

  const detenues = new Set(etat.clesDetenues);
  let retires = 0;
  for (const badge of badges) {
    const cle = qualificationDuBadge(badge.text);
    // Inconnu → on ignore. Détenu → on garde. Le reste est une allégation.
    if (!cle || detenues.has(cle)) continue;
    badge.remove();
    retires++;
  }
  if (retires === 0) return html;

  // Un conteneur vidé de ses badges ne doit pas subsister : `.footer-labels`
  // porte un `gap` et une marge, qui laisseraient un blanc inexpliqué sous le
  // texte du pied de page.
  for (const conteneur of root.querySelectorAll(CONTENEURS)) {
    if (conteneur.querySelectorAll(BADGES).length === 0 && !conteneur.text.trim()) {
      conteneur.remove();
    }
  }

  return root.toString();
}
