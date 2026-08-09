/**
 * Choisit, dans un design qui livre DEUX rédactions, celle qui dit la vérité.
 *
 * Les templates CVC écrivent chaque affirmation liée au RGE en double :
 *
 *   <span data-rge="oui">Certifié <b>RGE</b></span>
 *   <span data-rge="non">Assurance <b>décennale</b></span>
 *
 * et comptent sur un tiers pour trancher. Côté aperçu Claude Design, ce tiers
 * est le panneau Tweaks, qui pose `data-sans-rge` sur `<html>` ; le CSS livré
 * fait le reste :
 *
 *   html:not([data-sans-rge]) [data-rge="non"] { display: none }
 *
 * Sur un site rendu, personne ne pose cet attribut. La variante « non » est donc
 * masquée EN PERMANENCE et la variante « oui » s'affiche toujours — y compris
 * pour les entreprises dont l'ADEME confirme zéro qualification. C'est ce module
 * qui manquait : le bandeau de logos disparaissait bien, et tout le texte autour
 * continuait d'affirmer le RGE.
 *
 * LE PIÈGE, et c'est la raison d'être de `libererSurvivants` : retirer la
 * variante perdante NE SUFFIT PAS. Les nœuds gagnants portent encore leur
 * `data-rge`, et la règle CSS ci-dessus continuerait de masquer ceux en « non ».
 * On obtiendrait un pied de page VIDE au lieu du texte de repli — un correctif
 * qui donne l'illusion de marcher tout en effaçant le contenu qu'il devait
 * révéler. L'attribut est donc retiré des survivants.
 *
 * TROIS RÈGLES DE SÛRETÉ :
 *
 *   1. Rien n'est réécrit tant que rien n'est vérifié. Pas de SIRET, ou ADEME
 *      jamais interrogée → le markup sort intact (§A10 de la passation).
 *   2. Aucun texte n'est inventé. Les deux rédactions viennent du design ; on
 *      choisit, on n'écrit pas. Seul `[data-rge-noms]` est rempli, avec les noms
 *      de certificats réellement détenus.
 *   3. Une zone sans jumelle disparaît. La section « aides » n'existe qu'en
 *      « oui » : MaPrimeRénov' et les CEE EXIGENT un installateur RGE, donc une
 *      entreprise qui n'en a pas n'a rien à en dire. Le vide est la seule
 *      réponse honnête, et le design l'a prévu ainsi.
 *
 * Pur et isomorphe, même pipeline `node-html-parser` que ses voisins.
 */
import { parse } from "node-html-parser";

export type VarianteRge = "oui" | "non";

export type EtatRgeRegions = {
  /** L'ADEME a-t-elle réellement été interrogée pour cette entreprise ? */
  verifie: boolean;
  /** Noms courts des qualifications détenues, pour `[data-rge-noms]`. */
  noms: string[];
};

const REGIONS = "[data-rge]";
const NOMS = "[data-rge-noms]";
/** Le jumeau d'attribut d'une `<meta>` : un attribut ne s'enveloppe pas. */
const META_JUMEAU = "data-content-sans-rge";

/** Ce markup porte-t-il le contrat des deux rédactions ? */
export const porteDesVariantesRge = (html: string): boolean =>
  html.includes("data-rge") || html.includes(META_JUMEAU);

/**
 * Le séparateur du gabarit, réutilisé tel quel.
 *
 * Le design n'écrit pas la liste de la même façon partout : « QualiPAC et
 * Qualibat » dans une phrase, « QualiPAC · Qualibat » dans un badge. Déduire le
 * séparateur du texte d'exemple garde la typographie voulue, au lieu d'imposer
 * une virgule qui jurerait dans les deux cas.
 */
const separateurDuGabarit = (exemple: string): string => {
  if (exemple.includes(" · ")) return " · ";
  if (/\bet\b/.test(exemple)) return " et ";
  if (exemple.includes(" | ")) return " | ";
  return ", ";
};

/** « a, b et c » — la dernière jonction suit le séparateur choisi. */
const enumerer = (noms: string[], sep: string): string => {
  if (noms.length <= 1) return noms[0] ?? "";
  if (sep !== " et ") return noms.join(sep);
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
};

/**
 * Applique la bonne rédaction.
 *
 * @param html  markup brut de la section
 * @param etat  ce que l'ADEME a réellement confirmé
 */
export function stripRgeRegions(html: string, etat: EtatRgeRegions): string {
  // Sans vérification, on ne touche à rien : l'ignorance n'est pas une absence.
  if (!etat.verifie) return html;
  if (!porteDesVariantesRge(html)) return html;

  const variante: VarianteRge = etat.noms.length > 0 ? "oui" : "non";
  const root = parse(html);

  // ── 1. La variante perdante s'en va, avec tout ce qu'elle contient.
  for (const noeud of root.querySelectorAll(REGIONS)) {
    if (noeud.getAttribute("data-rge") !== variante) noeud.remove();
  }

  // ── 2. Les survivants perdent leur attribut, sinon le CSS du design les
  //      masquerait — cf. l'en-tête de ce fichier.
  for (const noeud of root.querySelectorAll(REGIONS)) {
    noeud.removeAttribute("data-rge");
  }

  // ── 3. Les noms réels, à la place du gabarit.
  if (variante === "oui") {
    for (const noeud of root.querySelectorAll(NOMS)) {
      const sep = separateurDuGabarit(noeud.text);
      noeud.set_content(enumerer(etat.noms, sep));
      noeud.removeAttribute("data-rge-noms");
    }
  }

  // ── 4. La `<meta>` : le seul cas qu'aucun CSS ne pourrait traiter, puisque
  //      la valeur vit dans un attribut et non dans un nœud.
  for (const meta of root.querySelectorAll(`[${META_JUMEAU}]`)) {
    const sansRge = meta.getAttribute(META_JUMEAU);
    if (variante === "non" && sansRge) meta.setAttribute("content", sansRge);
    meta.removeAttribute(META_JUMEAU);
  }

  return root.toString();
}
