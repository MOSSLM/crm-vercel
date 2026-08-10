import { z } from "zod";
import type { AxePublieId } from "@/lib/audit-site/lecture";
import type { Verdict } from "@/lib/audit-site/types";

/**
 * Le cadre donné à l'agent qui prépare l'audit.
 *
 * LE PROBLÈME. L'analyseur ne mesure pas tout. Il sait dire si un formulaire
 * existe, pas combien de champs il demande ; si un numéro est cliquable, pas
 * combien de gestes il faut pour l'atteindre. Or ce sont exactement les chiffres
 * qui parlent à un artisan — « 9 champs à remplir » se vérifie sur son téléphone
 * en dix secondes, « conversion faible » ne se vérifie pas du tout.
 *
 * Claude Code ouvre déjà chaque site pour qualifier l'entreprise. Il peut donc
 * relever ces faits. Mais un agent à qui l'on dit « note ce que tu observes »
 * invente des catégories, change d'unité d'un prospect à l'autre, et finit par
 * écrire un pourcentage que personne ne pourra défendre en rendez-vous.
 *
 * LA RÈGLE, en une phrase : **il remplit des cases qu'on a définies, il n'en
 * crée pas.** Le catalogue ci-dessous est fermé. Une clé absente est refusée ;
 * une valeur qui ne correspond pas à l'unité déclarée est refusée ; une valeur
 * hors des bornes de plausibilité est refusée. Ce qui passe devient un fondement
 * citable au même titre qu'une preuve mesurée.
 *
 * CE QUI N'Y EST PAS, ET POURQUOI. Aucune entrée ne permet d'écrire une position
 * dans les résultats Google. Un rang relevé une fois, non daté et non
 * reproductible, est la ligne la plus contestable qu'on puisse mettre devant un
 * prospect : il tapera la requête lui-même, verra un autre chiffre, et c'est
 * tout le rapport qui perd sa valeur. Tant qu'on n'aura pas de vrai suivi de
 * position, on n'en parle pas.
 *
 * BÉNÉFICE DE STRUCTURE. Une même clé peut être produite plus tard par
 * l'analyseur au lieu de l'agent — le comptage des champs se lit dans le HTML
 * qu'on télécharge déjà. Le jour où c'est automatisé, la mesure remplace
 * l'observation et le document ne change pas d'un caractère.
 */

/**
 * Les unités autorisées.
 *
 * Ce sont celles de la règle éditoriale, et la liste est courte exprès : les
 * secondes, le oui/non, les comptages de choses visibles, les dates, et la
 * position dans une page. Pas de pourcentage — un pourcentage sur un seul site
 * n'a pas de dénominateur vérifiable. Pas de Ko ni de Mo — le poids d'une page
 * se mesure en octets et se raconte en secondes.
 */
export type UniteObservation = "secondes" | "comptage" | "oui_non" | "date" | "position_ecran";

export interface DefinitionObservation {
  cle: string;
  /** Le libellé montré au prospect. Rédigé, pas technique. */
  libelle: string;
  /** L'axe sous lequel le constat se range dans le document. */
  axe: AxePublieId;
  unite: UniteObservation;
  /** Le seuil qui juge. Sur `oui_non`, c'est `attendu` qui juge. */
  seuil?: number;
  /** La valeur attendue d'un `oui_non`. */
  attendu?: boolean;
  /** `max` : au-delà du seuil c'est un problème. `min` : en dessous. */
  sens?: "max" | "min";
  /** Bornes de plausibilité. Hors bornes, on refuse plutôt que d'afficher. */
  min?: number;
  max?: number;
  /**
   * Comment le prospect le vérifie LUI-MÊME en moins de dix secondes.
   *
   * Ce champ n'est pas de la documentation : c'est le test d'entrée au
   * catalogue. Une observation qui ne peut pas s'écrire ainsi ne se défend pas
   * en rendez-vous, donc elle n'a rien à faire dans le document.
   */
  verification: string;
}

export const CATALOGUE_OBSERVATIONS: readonly DefinitionObservation[] = [
  {
    cle: "champs_formulaire",
    libelle: "Champs à remplir pour vous écrire",
    axe: "conversion",
    unite: "comptage",
    seuil: 4,
    sens: "max",
    min: 0,
    max: 40,
    verification: "Ouvrez votre formulaire de contact et comptez les cases à remplir.",
  },
  {
    cle: "champs_obligatoires",
    libelle: "Champs obligatoires",
    axe: "conversion",
    unite: "comptage",
    seuil: 3,
    sens: "max",
    min: 0,
    max: 40,
    verification: "Comptez les cases marquées d’une étoile dans votre formulaire.",
  },
  {
    cle: "gestes_pour_appeler",
    libelle: "Gestes pour vous appeler depuis un téléphone",
    axe: "conversion",
    unite: "comptage",
    seuil: 1,
    sens: "max",
    min: 1,
    max: 12,
    verification:
      "Ouvrez votre site sur votre téléphone et comptez les gestes jusqu’à déclencher l’appel.",
  },
  {
    cle: "position_telephone",
    libelle: "Écran où apparaît votre numéro",
    axe: "conversion",
    unite: "position_ecran",
    seuil: 1,
    sens: "max",
    min: 1,
    max: 30,
    verification: "Faites défiler votre accueil et notez au bout de combien d’écrans le numéro apparaît.",
  },
  {
    cle: "avis_affiches",
    libelle: "Avis clients visibles sur votre site",
    axe: "popularite",
    unite: "oui_non",
    attendu: true,
    verification: "Ouvrez votre page d’accueil et cherchez un seul avis client.",
  },
  {
    cle: "horaires_affiches",
    libelle: "Horaires d’ouverture sur le site",
    axe: "conversion",
    unite: "oui_non",
    attendu: true,
    verification: "Cherchez vos horaires sur le site, sans passer par votre fiche Google.",
  },
  {
    cle: "zone_intervention",
    libelle: "Communes couvertes indiquées",
    axe: "seo",
    unite: "oui_non",
    attendu: true,
    verification: "Cherchez sur le site la liste des communes où vous intervenez.",
  },
  {
    cle: "photos_realisations",
    libelle: "Photos de vos chantiers",
    axe: "popularite",
    unite: "comptage",
    seuil: 3,
    sens: "min",
    min: 0,
    max: 500,
    verification: "Comptez les photos de vos propres chantiers sur le site.",
  },
  {
    cle: "photos_sans_description",
    libelle: "Photos sans description lisible par Google",
    axe: "seo",
    unite: "comptage",
    seuil: 0,
    sens: "max",
    min: 0,
    max: 500,
    verification:
      "Sur pagespeed.web.dev, la ligne « attributs alt » liste les images concernées.",
  },
  {
    cle: "derniere_actualite",
    libelle: "Dernière mise à jour visible du site",
    axe: "popularite",
    unite: "date",
    verification: "Cherchez la date la plus récente affichée sur le site.",
  },
  {
    cle: "certificat_expire_le",
    libelle: "Expiration du certificat de sécurité",
    axe: "bonnes_pratiques",
    unite: "date",
    verification: "Touchez le cadenas dans la barre d’adresse pour voir la date.",
  },
] as const;

const PAR_CLE = new Map(CATALOGUE_OBSERVATIONS.map((d) => [d.cle, d]));

/** Ce que l'agent soumet : une clé du catalogue, une valeur. Rien d'autre. */
export const ObservationSoumise = z.object({
  cle: z.string().min(1),
  valeur: z.union([z.number(), z.boolean(), z.string()]),
});
export type ObservationSoumise = z.infer<typeof ObservationSoumise>;

export interface ObservationValidee {
  cle: string;
  libelle: string;
  axe: AxePublieId;
  /** Déjà formatée pour l'affichage : « 9 », « 9,8 s », « non », « 14/03/2026 ». */
  valeur: string;
  /** Le seuil, formaté de même. `null` quand la question est binaire. */
  seuil: string | null;
  verdict: Verdict;
  verification: string;
  /** La valeur brute, pour alimenter `univers.nombres`. */
  brut: number | null;
}

export interface RejetObservation {
  cle: string;
  pourquoi: string;
}

export interface VerdictObservations {
  retenues: ObservationValidee[];
  rejets: RejetObservation[];
}

/**
 * Applique le cadre. Ne lève jamais : un rejet est un résultat, pas une panne.
 *
 * Une observation refusée disparaît simplement — on ne la corrige pas. Corriger
 * une valeur qu'on juge fausse reviendrait à en inventer une autre, ce qui est
 * précisément le risque qu'on écarte ici.
 */
export function validerObservations(brut: unknown): VerdictObservations {
  const parse = z.array(ObservationSoumise).safeParse(brut ?? []);
  if (!parse.success) {
    return { retenues: [], rejets: [{ cle: "structure", pourquoi: "forme invalide" }] };
  }

  const retenues: ObservationValidee[] = [];
  const rejets: RejetObservation[] = [];
  const vues = new Set<string>();

  for (const o of parse.data) {
    const def = PAR_CLE.get(o.cle);
    if (!def) {
      rejets.push({ cle: o.cle, pourquoi: "clé absente du catalogue d'observations" });
      continue;
    }
    if (vues.has(o.cle)) {
      rejets.push({ cle: o.cle, pourquoi: "observation en double" });
      continue;
    }

    const validee = evaluer(def, o.valeur);
    if (typeof validee === "string") {
      rejets.push({ cle: o.cle, pourquoi: validee });
      continue;
    }

    vues.add(o.cle);
    retenues.push(validee);
  }

  return { retenues, rejets };
}

/** Rend l'observation validée, ou la raison du refus. */
function evaluer(def: DefinitionObservation, valeur: unknown): ObservationValidee | string {
  const commun = {
    cle: def.cle,
    libelle: def.libelle,
    axe: def.axe,
    verification: def.verification,
  };

  if (def.unite === "oui_non") {
    if (typeof valeur !== "boolean") return "attendu oui/non";
    const attendu = def.attendu !== false;
    return {
      ...commun,
      valeur: valeur ? "oui" : "non",
      seuil: null,
      verdict: valeur === attendu ? "ok" : "probleme",
      brut: null,
    };
  }

  if (def.unite === "date") {
    if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
      return "attendu une date AAAA-MM-JJ";
    }
    const d = new Date(`${valeur}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return "date impossible";
    return {
      ...commun,
      valeur: valeur.split("-").reverse().join("/"),
      seuil: null,
      // Une date ne se juge pas dans l'abstrait : elle situe, elle n'accuse pas.
      // C'est la rédaction qui en tire un constat, pas le cadre.
      verdict: "moyen",
      brut: null,
    };
  }

  if (typeof valeur !== "number" || !Number.isFinite(valeur)) return "attendu un nombre";
  if (def.min != null && valeur < def.min) return `valeur hors bornes (min ${def.min})`;
  if (def.max != null && valeur > def.max) return `valeur hors bornes (max ${def.max})`;

  const sens = def.sens ?? "max";
  const seuil = def.seuil;
  const verdict: Verdict =
    seuil == null ? "moyen" : sens === "max" ? (valeur > seuil ? "probleme" : "ok") : valeur < seuil ? "probleme" : "ok";

  return {
    ...commun,
    valeur: formater(def.unite, valeur),
    seuil: seuil == null ? null : formater(def.unite, seuil),
    verdict,
    brut: valeur,
  };
}

function formater(unite: UniteObservation, n: number): string {
  switch (unite) {
    case "secondes":
      return `${n.toFixed(1).replace(".", ",")} s`;
    case "position_ecran":
      return n === 1 ? "1ᵉʳ écran" : `${n}ᵉ écran`;
    default:
      return `${n}`;
  }
}

/**
 * La clé sous laquelle une observation se cite comme fondement.
 *
 * Même forme que `google:<id>` : le préfixe dit d'où vient le fait, ce qui rend
 * un audit relisible trois semaines plus tard sans avoir à deviner.
 */
export function cleFondement(cle: string): string {
  return `obs:${cle}`;
}

/** Les observations en échec — les seules qui peuvent fonder un constat. */
export function fondementsDe(retenues: readonly ObservationValidee[]): string[] {
  return retenues.filter((o) => o.verdict === "probleme").map((o) => cleFondement(o.cle));
}
