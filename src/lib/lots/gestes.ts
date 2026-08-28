/**
 * Ce qu'on peut LANCER sur un lot, et ce qui attend ailleurs.
 *
 * ── POURQUOI CE MODULE EXISTE ────────────────────────────────────────────
 * `couverture.ts` dit ce qui MANQUE à un lot (les sept axes) et quel geste
 * comblerait le premier trou. Il ne dit pas si ce geste se déclenche d'ici :
 * son champ `ou` est une indication de lecture (« Lissage — passe 1 »), pas une
 * commande. Résultat, l'écran des lots savait dire « rapprocher au registre »
 * et laissait l'humain aller chercher lui-même où le faire.
 *
 * Ce module fait la jonction : quels axes chaque geste comble, et lesquels ne
 * se lancent pas depuis le CRM.
 *
 * ── DEUX GESTES SEULEMENT SONT DES BOUTONS, ET C'EST HONNÊTE ─────────────
 * Sur les sept axes, trois se comblent par une route (le lissage en couvre
 * trois à lui seul, la mise en campagne un). Les autres demandent le poste
 * local — Playwright, un profil Chrome persistant, des CAPTCHA — ou un écran
 * qui travaille fiche par fiche. Onze des trente-trois bots du registre sont
 * dans ce cas, et ce n'est pas une dette : c'est la raison pour laquelle ils
 * marchent.
 *
 * Fabriquer un bouton qui « lancerait » ce qui ne peut pas l'être ferait pire
 * que rien : on cliquerait, il ne se passerait rien de visible, et on
 * chercherait la panne dans le mauvais code. On nomme donc l'endroit au lieu
 * d'inventer la commande — c'est déjà ce que fait `AXES[].ou`.
 */

import { AXES, manque, prochainGeste, type CleAxe, type Couverture } from "./couverture";

export type CleGeste = "lisser" | "campagne" | "plaquettes";

export interface GesteDeLot {
  cle: CleGeste;
  /** Ce qui s'écrit sur le bouton. */
  libelle: string;
  /** Ce que ça déclenche, en une phrase — lue en infobulle et sous le bouton. */
  fait: string;
  /**
   * Les axes de couverture que ce geste fait avancer. Vide = il n'en comble
   * aucun des sept : il prépare autre chose, et ne doit donc jamais être
   * proposé comme « le prochain geste ».
   */
  comble: readonly CleAxe[];
}

/**
 * Les gestes lançables depuis la fiche d'un lot, dans l'ordre du plan de
 * préparation : on lisse, puis on démarche. Les plaquettes viennent en dernier
 * parce qu'elles ne conditionnent rien — elles servent le jour du rendez-vous.
 */
export const GESTES: readonly GesteDeLot[] = [
  {
    cle: "lisser",
    libelle: "Lancer une passe de lissage",
    fait: "Met le lot en file : rapprochement au registre, données publiques, recherche de présence web. Aucun identifiant ne circule — la route lit le lot elle-même.",
    comble: ["siret", "donnees", "constat"],
  },
  {
    cle: "campagne",
    libelle: "Mettre en campagne",
    fait: "Verse les entreprises du lot dans la liste d'une campagne. Elles n'en partent pas pour autant : la revue avant lancement dit qui est écarté, et pourquoi.",
    comble: ["sequence"],
  },
  {
    cle: "plaquettes",
    libelle: "Préparer les plaquettes",
    fait: "Prépare le LIEN de chaque plaquette, celui qui relit les prix du jour à chaque ouverture. Le PDF passe par Puppeteer et reste au bureau.",
    comble: [],
  },
] as const;

const PAR_AXE = new Map<CleAxe, GesteDeLot>();
for (const g of GESTES) for (const axe of g.comble) if (!PAR_AXE.has(axe)) PAR_AXE.set(axe, g);

/** Le geste qui comble cet axe, ou `null` s'il ne se lance pas d'ici. */
export const gestePourAxe = (cle: CleAxe): GesteDeLot | null => PAR_AXE.get(cle) ?? null;

/**
 * Le geste à mettre en avant, ou `null`.
 *
 * `null` a DEUX causes qu'il ne faut pas confondre, et c'est l'écran qui les
 * sépare : soit le lot n'a plus de trou (`prochainGeste` rend null), soit son
 * prochain trou se comble ailleurs — fabriquer une démo, préparer un audit,
 * attribuer. Rendre le deuxième geste lançable à la place serait le pire
 * choix : on travaillerait la présence web de fiches dont le nom est encore
 * faux, ce que l'ordre des axes existe précisément pour éviter.
 */
export function gesteConseille(c: Couverture): GesteDeLot | null {
  const axe = prochainGeste(c);
  return axe ? gestePourAxe(axe.cle) : null;
}

/**
 * Combien de fiches ce geste ferait avancer — le plus gros de ses axes.
 *
 * Le PLUS GROS et non la somme : une même entreprise manque souvent de son
 * SIRET ET de ses données publiques, et les additionner annoncerait plus de
 * travail qu'il n'y en a.
 */
export function porteeDuGeste(c: Couverture, geste: GesteDeLot): number {
  return geste.comble.reduce((n, cle) => Math.max(n, manque(c, cle)), 0);
}

/**
 * Ce qui reste à faire ailleurs : un axe incomplet, et l'endroit où il se
 * comble. Sert la ligne « et ce qui n'est pas ici » sous les boutons — sans
 * elle, un lot bloqué sur « fabriquer les démos » n'aurait plus rien à
 * proposer et paraîtrait fini.
 */
export function ailleurs(c: Couverture): { axe: string; ou: string; combien: number }[] {
  return AXES.filter((a) => manque(c, a.cle) > 0 && !PAR_AXE.has(a.cle)).map((a) => ({
    axe: a.geste,
    ou: a.ou,
    combien: manque(c, a.cle),
  }));
}
