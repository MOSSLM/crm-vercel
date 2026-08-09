/**
 * Combien de qualifications RGE afficher — et surtout, quand ne rien afficher.
 *
 * LE PIÈGE QUE CE MODULE EXISTE POUR ÉVITER : un `count(*)` appliqué partout
 * confond deux situations opposées.
 *
 *   « L'ADEME dit 0 »        → absence VÉRIFIÉE. Le site ne doit rien afficher.
 *   « On n'a pas regardé »   → IGNORANCE. On ne sait rien, donc on ne retire rien.
 *
 * Sur le parc, les deux existent en nombre : des fiches dont on a interrogé
 * l'ADEME et qui n'ont réellement aucune qualification, et des fiches sans SIRET
 * ou jamais hydratées, pour lesquelles la question n'a jamais été posée.
 *
 * Traiter les secondes comme les premières viderait des blocs de certifications
 * probablement légitimes. Traiter les premières comme les secondes laisserait en
 * ligne un logo que l'entreprise ne détient pas — le cas ECLEIS, une allégation
 * trompeuse sur un site qu'on produit.
 *
 * D'où la règle, décidée par le propriétaire le 08/08/2026 :
 * **`count(*)` ne fait autorité que là où on a vérifié.**
 */

/** Ce qu'on sait de l'état RGE d'une fiche, du point de vue de la vérification. */
export type EtatVerificationRge = {
  /** La fiche porte-t-elle un identifiant légal ? Sans lui, rien n'est atteignable. */
  aSiret: boolean;
  /** L'ADEME a-t-elle été RÉELLEMENT interrogée pour cette fiche ? */
  rgeInterroge: boolean;
  /** Qualifications non retirées et non expirées à ce jour. */
  qualificationsValides: number;
};

export type VerdictRge =
  | { source: "official"; valeur: string; verifie: true }
  | { source: "ademe"; valeur: string; verifie: true }
  | { source: "saisie"; valeur: string; verifie: false }
  | { source: "aucune"; valeur: ""; verifie: true };

const vide = (v: string | null | undefined): boolean => {
  if (v == null) return true;
  const t = String(v).trim();
  return t === "" || t === "0" || t === "-" || t === "—";
};

/**
 * Le compteur à afficher, et d'où il vient.
 *
 * Ordre de priorité, du plus fort au plus faible :
 *
 * 1. `stat_rge_count_official` — le chiffre CONFIRMÉ par le client. Il gagne
 *    toujours, y compris contre l'ADEME : le client sait ce qu'il détient, et
 *    cette colonne ne doit jamais être écrasée (§A5).
 * 2. L'ADEME, **si et seulement si** on l'a interrogée. Un 0 vérifié est une
 *    réponse : le bloc disparaît.
 * 3. La saisie manuelle, quand on n'a rien vérifié. On ne retire pas ce qu'on
 *    n'a pas contrôlé — mais le verdict porte `verifie: false`, et l'interface
 *    CRM doit le dire.
 */
export const verdictRge = (
  etat: EtatVerificationRge,
  statSaisi: string | null | undefined,
  statOfficiel: string | null | undefined,
): VerdictRge => {
  if (!vide(statOfficiel)) {
    return { source: "official", valeur: String(statOfficiel).trim(), verifie: true };
  }

  // On n'a la réponse de l'ADEME que si la fiche a un SIRET ET qu'on a
  // effectivement posé la question. Les deux conditions comptent : un SIRET tout
  // juste résolu, pas encore hydraté, ne prouve rien.
  const verifie = etat.aSiret && etat.rgeInterroge;

  if (verifie) {
    return etat.qualificationsValides > 0
      ? { source: "ademe", valeur: String(etat.qualificationsValides), verifie: true }
      : { source: "aucune", valeur: "", verifie: true };
  }

  return vide(statSaisi)
    ? { source: "aucune", valeur: "", verifie: true }
    : { source: "saisie", valeur: String(statSaisi).trim(), verifie: false };
};

/**
 * Le bloc de certifications doit-il être rendu ?
 *
 * `false` veut dire : pas de bloc DU TOUT — ni titre, ni cadre vide, ni
 * placeholder. Un bloc vide sur une démo dit « cette entreprise n'a rien », ce
 * qui est aussi faux qu'un logo de trop quand on n'a simplement pas regardé.
 */
export const afficherBlocCertifications = (verdict: VerdictRge): boolean =>
  verdict.valeur !== "";

/**
 * Le message à montrer DANS LE CRM (jamais sur le site public).
 *
 * L'interface doit dire pourquoi elle affiche ce qu'elle affiche, sans quoi le
 * propriétaire ne peut pas décider en connaissance de cause.
 */
export const explicationRge = (verdict: VerdictRge, etat: EtatVerificationRge): string => {
  switch (verdict.source) {
    case "official":
      return "Chiffre confirmé par le client — prioritaire sur toutes les sources.";
    case "ademe":
      return `${verdict.valeur} qualification${Number(verdict.valeur) > 1 ? "s" : ""} valides à l'ADEME.`;
    case "saisie":
      return etat.aSiret
        ? "Valeur saisie à la main. L'ADEME n'a pas encore été interrogée pour cette fiche : rien n'est vérifié."
        : "Valeur saisie à la main. Sans SIRET, aucune vérification n'est possible.";
    case "aucune":
      return etat.aSiret && etat.rgeInterroge
        ? "L'ADEME ne rend aucune qualification pour cette entreprise. Aucun bloc de certifications ne sera affiché."
        : "Aucune qualification connue.";
  }
};
