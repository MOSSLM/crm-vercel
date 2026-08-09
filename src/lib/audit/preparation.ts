import { z } from "zod";

/**
 * Le contrat de rédaction : ce qu'un modèle a le droit d'écrire dans un audit.
 *
 * LA RÈGLE TIENT EN UNE PHRASE.
 *
 *   Le dossier est l'univers du dicible.
 *
 * Liberté entière sur les mots, l'ordre et l'accroche — c'est là que vit la
 * personnalisation, et c'est ce qu'un modèle fait mieux qu'un gabarit. Aucune
 * affirmation, en revanche, qui ne soit adossée à une entrée du dossier.
 *
 * POURQUOI DANS LE CODE ET NON DANS LE PROMPT. Un prompt se contourne, s'oublie
 * en changeant de modèle, et ne laisse aucune trace quand il échoue. Une règle
 * appliquée à l'écriture, elle, ne peut pas être négociée : une carte sans
 * preuve ne franchit pas la validation, point. Tout le reste de ce chantier
 * consiste à ne dire que ce qu'on a mesuré ; il serait absurde de rouvrir la
 * porte au dernier étage.
 *
 * QUATRE RÈGLES, appliquées ci-dessous dans cet ordre :
 *   1. un constat qui ne référence aucune entrée du dossier est rejeté ;
 *   2. un code d'offre inconnu ou non proposable est rejeté ;
 *   3. tout nombre présent dans la rédaction doit se retrouver dans le dossier ;
 *   4. rejet ⇒ repli sur le texte du catalogue, jamais de blocage.
 */

export const CartePreparee = z.object({
  /** Clé de constat du catalogue (`src/data/auditIssues.ts`). */
  cle: z.string().min(1),
  /** Clés de preuves du dossier qui fondent cette carte. Au moins une. */
  fonde_sur: z.array(z.string().min(1)).min(1),
  titre: z.string().min(3).max(90),
  texte: z.string().min(20).max(420),
});

export const PreparationAudit = z.object({
  /** Introduction de la page « Situation ». */
  intro: z.string().min(20).max(600).optional(),
  /** Une phrase d'accroche, pour le message d'envoi. */
  accroche: z.string().min(10).max(200).optional(),
  /** Trois cartes au plus : au-delà, l'audit accable au lieu de convaincre. */
  cartes: z.array(CartePreparee).min(1).max(3),
  /** Codes d'offres à proposer, pris dans le dossier. */
  offres: z.array(z.string().min(1)).max(8).default([]),
});

export type PreparationAudit = z.infer<typeof PreparationAudit>;
export type CartePreparee = z.infer<typeof CartePreparee>;

/** Ce que le dossier autorise à dire, réduit à ce que la validation vérifie. */
export interface UniversDicible {
  /** Clés de preuves réellement en échec, seules citables comme fondement. */
  preuvesEnEchec: Set<string>;
  /** Clés de constats que la mesure a émises. */
  constatsEmis: Set<string>;
  /** Codes d'offres proposables. */
  offresProposables: Set<string>;
  /**
   * Tous les nombres qui figurent dans le dossier, normalisés.
   * Un chiffre absent d'ici n'a pas le droit d'apparaître dans la rédaction.
   */
  nombres: Set<string>;
}

export interface Rejet {
  regle: 1 | 2 | 3;
  quoi: string;
  pourquoi: string;
}

export interface Verdict {
  /** La préparation, débarrassée de ce qui ne passe pas. `null` si rien ne reste. */
  retenue: PreparationAudit | null;
  rejets: Rejet[];
}

/**
 * Les nombres d'un texte, normalisés pour la comparaison.
 *
 * « 3,4 » et « 3.4 » sont le même nombre ; « 1 043 » et « 1043 » aussi. Sans
 * cette normalisation, la règle 3 rejetterait des chiffres pourtant exacts, et
 * on finirait par la désactiver — ce qui reviendrait à ne pas l'avoir.
 */
export function nombresDe(texte: string): string[] {
  const sansEspacesFins = texte.replace(/(\d)[  \s](?=\d{3}\b)/g, "$1");
  return (sansEspacesFins.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/**
 * Les années et les petits ordinaux ne sont pas des mesures.
 *
 * « depuis 1998 », « 3 semaines », « 7 jours » : exiger qu'ils figurent dans le
 * dossier interdirait toute phrase naturelle, et la règle serait contournée par
 * lassitude plutôt que respectée.
 */
function estNombreLibre(n: string): boolean {
  const v = Number(n);
  if (!Number.isFinite(v)) return true;
  if (Number.isInteger(v) && v >= 1900 && v <= 2100) return true; // une année
  return Number.isInteger(v) && v <= 12; // un petit compte, un délai
}

/**
 * Applique le contrat. Ne lève jamais : un rejet est un résultat, pas une panne.
 *
 * Ce qui ne passe pas est RETIRÉ, pas corrigé. Corriger un texte qu'on juge faux
 * reviendrait à en inventer un autre, ce qui est précisément le risque qu'on
 * cherche à écarter.
 */
export function validerPreparation(brut: unknown, univers: UniversDicible): Verdict {
  const parse = PreparationAudit.safeParse(brut);
  if (!parse.success) {
    return {
      retenue: null,
      rejets: [{ regle: 1, quoi: "structure", pourquoi: parse.error.issues[0]?.message ?? "forme invalide" }],
    };
  }

  const p = parse.data;
  const rejets: Rejet[] = [];

  const cartes = p.cartes.filter((carte) => {
    // Règle 1 — un constat sans fondement mesuré n'existe pas.
    const fondements = carte.fonde_sur.filter((f) => univers.preuvesEnEchec.has(f));
    if (fondements.length === 0) {
      rejets.push({
        regle: 1,
        quoi: carte.cle,
        pourquoi: `aucune preuve en échec parmi [${carte.fonde_sur.join(", ")}]`,
      });
      return false;
    }

    // Règle 3 — tout chiffre affirmé doit venir du dossier.
    const inventes = [...nombresDe(carte.titre), ...nombresDe(carte.texte)].filter(
      (n) => !estNombreLibre(n) && !univers.nombres.has(n),
    );
    if (inventes.length > 0) {
      rejets.push({
        regle: 3,
        quoi: carte.cle,
        pourquoi: `chiffre absent du dossier : ${[...new Set(inventes)].join(", ")}`,
      });
      return false;
    }

    return true;
  });

  // Règle 2 — un code d'offre inconnu ou non proposable ne passe pas.
  const offres = p.offres.filter((code) => {
    if (univers.offresProposables.has(code)) return true;
    rejets.push({ regle: 2, quoi: code, pourquoi: "offre inconnue ou non proposable en audit" });
    return false;
  });

  // Même traitement pour l'intro et l'accroche : elles affirment aussi.
  const texteLibre = [p.intro, p.accroche].filter((t): t is string => Boolean(t));
  const inventesHorsCartes = texteLibre
    .flatMap(nombresDe)
    .filter((n) => !estNombreLibre(n) && !univers.nombres.has(n));

  const intro = inventesHorsCartes.length > 0 ? undefined : p.intro;
  const accroche = inventesHorsCartes.length > 0 ? undefined : p.accroche;
  if (inventesHorsCartes.length > 0) {
    rejets.push({
      regle: 3,
      quoi: "intro/accroche",
      pourquoi: `chiffre absent du dossier : ${[...new Set(inventesHorsCartes)].join(", ")}`,
    });
  }

  // Règle 4 — plus aucune carte : on ne retient rien, et l'appelant retombe sur
  // le texte du catalogue. Un audit moins ajusté vaut mieux qu'un audit faux.
  if (cartes.length === 0) return { retenue: null, rejets };

  return { retenue: { ...p, cartes, offres, intro, accroche }, rejets };
}
