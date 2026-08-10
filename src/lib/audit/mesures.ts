import type { AuditLu, AxePublieId } from "@/lib/audit-site/lecture";
import type { ConstatGoogle, Preuve } from "@/lib/audit-site/types";
import { cleFondement, type ObservationValidee } from "./observations";
import { forcePreuve } from "./autres-ameliorations";

/**
 * Ce que le document d'audit a le droit d'AFFICHER comme chiffre.
 *
 * LA FRONTIÈRE, et c'est la raison d'être du module : les mots sont éditables,
 * les chiffres ne le sont jamais. `AuditContent` porte la rédaction — titres,
 * phrases, ordre des blocs — et se retouche à la main avant chaque envoi.
 * `MesuresAudit` porte le relevé, et il n'est modifiable par personne. Un chiffre
 * retouché à la main est un faux, et c'est exactement ce que ce document existe
 * pour cesser d'être.
 *
 * D'où la règle d'écriture du rendu : deux objets séparés, jamais fusionnés, et
 * aucune valeur de mesure recopiée dans le contenu.
 *
 * Module PUR — pas de client Supabase, pas de `server-only`. Il se teste sans
 * base, et il tourne aussi bien dans la route d'export que dans l'aperçu.
 */

/**
 * La note du site préparé, affirmée et non mesurée.
 *
 * On ne mesure pas le démo, et ce n'est pas un manque : c'est une décision. La
 * vérification a été faite à la main, une fois, sur le gabarit qui sert à tous
 * les démos — la refaire par site coûterait quarante secondes de PageSpeed par
 * prospect pour reproduire un résultat qu'on connaît déjà.
 *
 * CONSÉQUENCE ÉDITORIALE, qui n'est pas négociable : c'est la seule valeur du
 * document qui affirme sans relever. Elle ne doit donc jamais être présentée
 * comme une mesure — pas de « mesuré le », pas d'horodatage, pas de « relevé ».
 * `LIBELLE_DEMO` existe pour qu'on n'ait pas à s'en souvenir à chaque rendu.
 */
export const NOTE_DEMO = 99;

/** Le sous-titre du repère démo. Décrit une capacité, pas un relevé. */
export const LIBELLE_DEMO = "ce que fait le site préparé à votre nom";

/**
 * En dessous, la médiane ne veut rien dire et le repère disparaît.
 *
 * Trente sites est un plancher volontairement bas : on ne cherche pas une
 * précision statistique, on cherche à ne pas situer un prospect par rapport à
 * quatre concurrents.
 */
export const MIN_ECHANTILLON_MEDIANE = 30;

/** Les noms affichables des axes. Un seul endroit, pour qu'ils ne divergent pas. */
export const NOM_AXE: Record<AxePublieId, string> = {
  vitesse: "Rapidité",
  seo: "Visibilité sur Google",
  mobile: "Sur téléphone",
  conversion: "Prise de contact",
  popularite: "Notoriété",
  accessibilite: "Accessibilité",
  bonnes_pratiques: "Bonnes pratiques",
};

export interface AxeMesure {
  id: AxePublieId;
  nom: string;
  note: number;
  /** Vrai ⇒ afficher « mesuré par Google ». Ne se revendique pas à tort. */
  mesureGoogle: boolean;
  /** La valeur la plus lourde de l'axe, déjà formatée. `null` si rien à montrer. */
  valeur: string | null;
  /** Ce que Google relève sur cet axe, dans ses mots. Vide hors mesure Google. */
  constats: ConstatGoogle[];
}

export interface Reperes {
  /** La note du prospect. `null` ⇒ la réglette s'affiche sans son repère. */
  prospect: number | null;
  /** Toujours présent : c'est une constante, pas une mesure. */
  demo: number;
  /** `null` ⇒ le repère ne s'affiche pas. Jamais de valeur de remplissage. */
  mediane: number | null;
  /** Le nombre de sites derrière la médiane. Affiché tel quel. */
  medianeN: number | null;
}

export interface ConstatMesure {
  /** La clé citable comme fondement : `google:image-alt`, ou la clé de preuve. */
  cle: string;
  libelle: string;
  valeur: string | null;
  seuil: string | null;
}

export interface MesuresAudit {
  url: string | null;
  /** Capture du site, hébergée chez nous. `null` ⇒ le document dessine un vide. */
  captureUrl: string | null;
  /** Horodatage de la mesure affichée — jamais omis, une mesure se date. */
  mesureLe: string | null;
  /** Vrai quand les axes viennent des catégories de Google. */
  mesureParGoogle: boolean;
  injoignable: boolean;
  httpStatus: number | null;
  noteGlobale: number | null;
  libelle: string | null;
  reperes: Reperes;
  axes: AxeMesure[];
  /** Ce qui n'a PAS été testé, nommé. Une page méthode sans ça ne vaut rien. */
  axesNonTestes: string[];
  /** Les preuves en échec, tous axes confondus, du plus lourd au plus léger. */
  constats: ConstatMesure[];
  /** Ce que l'agent a relevé, validé et formaté. Vide s'il n'a rien soumis. */
  observations: ObservationValidee[];
}

/** La médiane du parc, telle qu'une requête la rend. */
export interface EchantillonMediane {
  valeur: number | null;
  effectif: number;
}

/**
 * Assemble le relevé affichable.
 *
 * DEUX PIÈGES QUE CETTE FONCTION EXISTE POUR FERMER.
 *
 * 1. **La note n'est pas recalculée.** Elle vaut `note_globale`, produite par
 *    `scorer()` avec ses pondérations (vitesse 30, seo 30, mobile 20,
 *    conversion 20, popularité 0). La tentation du rendu est d'en refaire la
 *    moyenne des axes affichés : ce serait un troisième barème, différent du
 *    nôtre et de celui de Google, et personne ne saurait plus répondre à
 *    « pourquoi 37 ? ».
 *
 * 2. **La note globale n'est PAS la moyenne des axes affichés, et le document
 *    ne doit pas le prétendre.** Quand PageSpeed a mesuré, ce sont les quatre
 *    catégories de Google qui s'affichent, alors que `note_globale` reste
 *    calculée sur nos axes à nous. Les deux chiffres sont justes, ils ne
 *    s'additionnent simplement pas — un prospect qui ferait la moyenne des
 *    cartes ne retomberait pas sur le grand nombre. D'où `sousTitreNote()`, qui
 *    situe la note par rapport au parc au lieu de promettre une arithmétique
 *    fausse.
 *
 * La médiane, elle, se compare sans réserve : elle porte sur `note_globale`,
 * donc sur le même instrument que le prospect, mesuré ou non par Google.
 */
export function construireMesures(
  audit: AuditLu,
  echantillon?: EchantillonMediane | null,
): MesuresAudit {
  const mesureParGoogle = audit.axes.some((a) => a.mesureGoogle === true);
  const observations = observationsDe(audit);

  const axes: AxeMesure[] = audit.axes.map((a) => ({
    id: a.id,
    nom: NOM_AXE[a.id] ?? a.id,
    note: a.note,
    mesureGoogle: a.mesureGoogle === true,
    valeur: valeurDominante(a.preuves, a.constats),
    constats: a.constats ?? [],
  }));

  return {
    url: audit.url_finale ?? audit.url_analysee,
    captureUrl: audit.capture_url,
    // La date de la mesure AFFICHÉE : celle de Google quand c'est lui qui parle.
    mesureLe: mesureParGoogle ? (audit.psi_recupere_le ?? audit.analyse_le) : audit.analyse_le,
    mesureParGoogle,
    injoignable: audit.injoignable,
    httpStatus: audit.http_status,
    noteGlobale: audit.note_globale,
    libelle: audit.libelle,
    reperes: {
      prospect: audit.note_globale,
      demo: NOTE_DEMO,
      mediane: medianeAffichable(echantillon),
      medianeN: echantillon?.effectif ?? null,
    },
    axes,
    axesNonTestes: audit.axes_masques.map((id) => NOM_AXE[id] ?? id),
    constats: constatsDe(audit, observations),
    observations,
  };
}

/**
 * Les observations stockées, retypées.
 *
 * `AuditLu.observations` est `unknown[]` pour que `audit-site` ne dépende pas de
 * `audit`. La forme a été garantie à l'écriture par `validerObservations` — seul
 * chemin qui remplit cette clé — mais on filtre quand même sur les deux champs
 * dont l'affichage dépend : une ligne abîmée en base ne doit pas produire un
 * constat vide dans un document envoyé.
 */
function observationsDe(audit: AuditLu): ObservationValidee[] {
  return (audit.observations ?? []).filter(
    (o): o is ObservationValidee =>
      typeof o === "object" &&
      o !== null &&
      typeof (o as ObservationValidee).cle === "string" &&
      typeof (o as ObservationValidee).valeur === "string",
  );
}

/**
 * Le relevé vide — pour une entreprise jamais analysée.
 *
 * Le document doit se rendre quand même : l'opérateur ouvre parfois l'éditeur
 * avant que l'analyse soit passée, et une page blanche lui ferait croire à une
 * panne. Tous les blocs qui dépendent d'une mesure savent s'effacer ; ceux qui
 * n'en dépendent pas restent lisibles.
 */
export function mesuresVides(): MesuresAudit {
  return {
    url: null,
    captureUrl: null,
    mesureLe: null,
    mesureParGoogle: false,
    injoignable: false,
    httpStatus: null,
    noteGlobale: null,
    libelle: null,
    reperes: { prospect: null, demo: NOTE_DEMO, mediane: null, medianeN: null },
    axes: [],
    axesNonTestes: [],
    constats: [],
    observations: [],
  };
}

/**
 * La médiane, ou rien.
 *
 * Un repère de comparaison calculé sur un échantillon trop maigre situe le
 * prospect par rapport au hasard. Mieux vaut une réglette à deux repères qu'une
 * réglette qui ment sur le troisième.
 */
function medianeAffichable(e?: EchantillonMediane | null): number | null {
  if (!e || e.valeur == null) return null;
  return e.effectif >= MIN_ECHANTILLON_MEDIANE ? e.valeur : null;
}

/**
 * La valeur qui résume un axe : le constat le plus coûteux, sinon la preuve la
 * plus lourde en échec.
 *
 * Sur un axe mesuré par Google, les constats sont déjà triés par gain — le
 * premier est celui qui rapporte le plus, et sa valeur arrive déjà rédigée en
 * français (`locale=fr`). Sur un axe maison, on prend la preuve en échec au plus
 * gros poids : c'est celle qui a le plus pesé dans la note, donc celle qu'on
 * peut défendre.
 */
function valeurDominante(preuves: Preuve[], constats?: ConstatGoogle[]): string | null {
  const premier = constats?.[0];
  if (premier) return premier.valeur ?? premier.titre;

  // Trié sur la FORCE, pas sur le poids. Le second endroit où la distinction
  // comptait : la carte « Rapidité » d'un site mesuré à 1,3 s de serveur (poids
  // 35, mais 0,33 de gravité) et 5,7 Mo de page (poids 25, gravité 0,93)
  // affichait « 1,3 s ». Le prospect lisait donc une note de 10/100 justifiée
  // par un chiffre qui lui paraît correct — et cessait de croire la note.
  const echecs = preuves
    .filter((p) => p.verdict === "probleme" && p.valeur !== null)
    .sort((a, b) => forcePreuve(b) - forcePreuve(a));
  return echecs[0]?.valeur ?? null;
}

/**
 * Tout ce qui est en échec, prêt à être cité.
 *
 * Les constats Google d'abord — ils sont déjà classés par gain et le prospect
 * peut les revérifier en trente secondes sur pagespeed.web.dev — puis nos
 * preuves, du poids le plus lourd au plus léger. Les clés portent leur préfixe :
 * c'est sous cette forme exacte que `validerPreparation` les acceptera comme
 * fondement.
 */
function constatsDe(audit: AuditLu, observations: readonly ObservationValidee[]): ConstatMesure[] {
  const out: ConstatMesure[] = [];

  // Les observations de l'agent en tête : ce sont les seules lignes du document
  // que le prospect peut vérifier sur son propre téléphone, devant nous, en dix
  // secondes — c'est le critère qui les a fait entrer au catalogue.
  for (const o of observations) {
    if (o.verdict !== "probleme") continue;
    out.push({
      cle: cleFondement(o.cle),
      libelle: o.libelle,
      valeur: o.valeur,
      seuil: o.seuil,
    });
  }

  for (const c of audit.constats_google) {
    out.push({
      cle: `google:${c.id}`,
      libelle: c.titre,
      valeur: c.valeur,
      seuil: null,
    });
  }

  const vues = new Set<string>();
  const preuves = audit.axes
    .flatMap((a) => a.preuves)
    .filter((p) => p.verdict === "probleme" && p.valeur !== null)
    .sort((a, b) => b.poids - a.poids);

  for (const p of preuves) {
    if (vues.has(p.cle)) continue;
    vues.add(p.cle);
    out.push({ cle: p.cle, libelle: p.libelle, valeur: p.valeur, seuil: p.seuil });
  }

  return out;
}

/**
 * Le sous-titre de la note globale.
 *
 * La maquette annonçait « Moyenne des six axes mesurés ». C'est faux dès que
 * Google mesure — voir le second piège en tête de `construireMesures` — et une
 * phrase fausse sous le plus gros chiffre de la page est le pire endroit
 * possible pour en mettre une. On situe donc la note dans le parc, ce qui est
 * vrai dans tous les cas et plus utile au lecteur.
 */
export function sousTitreNote(m: MesuresAudit): string {
  const n = m.reperes.medianeN;
  if (m.reperes.mediane == null || !n) return "Sur ce que la mesure a pu voir";
  return `Comparée à ${n.toLocaleString("fr-FR")} sites d’artisans mesurés`;
}
