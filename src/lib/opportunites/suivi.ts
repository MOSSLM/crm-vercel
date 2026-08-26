/**
 * La politique de suivi : à partir de quand une affaire demande qu'on s'en occupe.
 *
 * ── POURQUOI ICI ET PAS DANS LA VUE SQL ──────────────────────────────────
 * `vue_opportunites_suivi` rend des durées — `jours_sans_echange`,
 * `jours_de_retard` — et rien d'autre. Le seuil, lui, est une décision
 * commerciale qui bougera : quatorze jours sur une piste froide, trois après un
 * devis envoyé, et probablement autre chose dans six mois. Enfermé dans la vue,
 * chaque ajustement coûterait une migration. Ici, il se relit et se change.
 *
 * ── LE SEUIL DÉPEND DE L'ÉTAPE, ET C'EST LA SEULE FAÇON QUE ÇA MARCHE ────
 * Un seuil unique produit soit du bruit, soit du silence. À quatorze jours pour
 * tout le monde, un devis envoyé et resté sans réponse pendant douze jours ne
 * remonte pas — or c'est précisément là que l'argent se perd. À trois jours pour
 * tout le monde, les six cents pistes jamais démarchées hurlent tous les matins
 * et on cesse de regarder la liste. Le seuil suit donc l'engagement du prospect :
 * plus il en a montré, plus vite le silence coûte cher.
 *
 * Les étapes sont dynamiques (`etapes_pipeline`, modifiables par l'utilisateur),
 * donc on ne peut pas s'accrocher à des identifiants. On lit le NOM de l'étape,
 * avec repli sur un seuil moyen : une étape inconnue vaut mieux qu'une étape
 * ignorée.
 *
 * ── L'ORDRE DES ÉTATS EST L'ORDRE DE LA JOURNÉE ──────────────────────────
 * Ce qui a une échéance dépassée passe avant ce qui n'a pas d'échéance du tout :
 * une promesse tenue en retard se rattrape, une affaire sans prochaine action
 * n'a encore rien promis à personne.
 */

/** Une ligne de `vue_opportunites_suivi`, telle que la route la rend. */
export type LigneSuivi = {
  opportunite_id: string;
  entreprise_id: number;
  entreprise_nom: string | null;
  ville: string | null;
  intitule: string | null;
  stage_id: number | null;
  etape_nom: string | null;
  etape_ordre: number | null;
  montant: number | null;
  mrr: number | null;
  priorite: string | null;
  owner_id: string | null;
  prochaine_action: string | null;
  date_prochain_suivi: string | null;
  dernier_echange_le: string | null;
  jours_sans_echange: number | null;
  jours_de_retard: number | null;
  creee_le: string | null;
};

export type EtatSuivi =
  /** Une prochaine action était promise pour une date passée. */
  | "en_retard"
  /** Aucun échange depuis plus longtemps que ce que l'étape tolère. */
  | "qui_pourrit"
  /** Engagée (au-delà de la simple piste) et sans prochaine action décidée. */
  | "sans_prochaine_action"
  /** Rien à signaler. */
  | "ok";

/**
 * Le silence toléré, en jours, selon l'étape. La clé est cherchée dans le nom
 * de l'étape, en minuscules et sans accents.
 *
 * Lu de haut en bas : la PREMIÈRE clé trouvée gagne. « Devis » avant « lead »
 * n'a pas d'importance ici, mais l'ordre compte pour les noms composés — une
 * étape « Relance devis » doit valoir le seuil d'un devis, pas celui d'une
 * relance générique.
 */
const SEUILS: Array<{ motif: string; jours: number }> = [
  { motif: "acompte", jours: 3 },
  { motif: "signe", jours: 3 },
  { motif: "signature", jours: 3 },
  { motif: "negoc", jours: 3 },
  { motif: "devis", jours: 4 },
  { motif: "proposition", jours: 4 },
  { motif: "rdv", jours: 5 },
  { motif: "rendez", jours: 5 },
  { motif: "appel", jours: 7 },
  { motif: "approche", jours: 7 },
  { motif: "contact", jours: 7 },
  { motif: "qualif", jours: 21 },
  { motif: "lead", jours: 30 },
  { motif: "nouveau", jours: 30 },
];

/** Le repli, pour une étape dont le nom ne dit rien de connu. */
const SEUIL_PAR_DEFAUT = 14;

/**
 * Au-delà de cette étape, une affaire sans prochaine action est signalée.
 * En deçà (piste brute, qualification), c'est le cas normal : on ne promet rien
 * à six cents fiches qu'on n'a pas encore appelées.
 */
const ETAPES_SANS_ENGAGEMENT = ["lead", "nouveau", "qualif", "trouve"];

/**
 * Les diacritiques sont désignés par leur point de code et non collés
 * littéralement dans la classe : un caractère combinant écrit tel quel dans un
 * source est invisible à la relecture et se fait normaliser par le premier
 * outil qui touche au fichier.
 */
const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function seuilDeSilence(etapeNom: string | null | undefined): number {
  if (!etapeNom) return SEUIL_PAR_DEFAUT;
  const nom = sansAccents(etapeNom);
  for (const { motif, jours } of SEUILS) if (nom.includes(motif)) return jours;
  return SEUIL_PAR_DEFAUT;
}

function estEngagee(etapeNom: string | null | undefined): boolean {
  if (!etapeNom) return true;
  const nom = sansAccents(etapeNom);
  return !ETAPES_SANS_ENGAGEMENT.some((m) => nom.includes(m));
}

/**
 * Classe une ligne. Une opportunité JAMAIS touchée n'est pas « qui pourrit » :
 * `jours_sans_echange` est nul, et rien n'a commencé à se gâter. C'est le cas
 * de la grande majorité du fichier ; la traiter comme une urgence rendrait la
 * liste inutilisable dès le premier jour.
 */
export function classer(ligne: LigneSuivi): EtatSuivi {
  if (typeof ligne.jours_de_retard === "number" && ligne.jours_de_retard > 0) {
    return "en_retard";
  }

  const silence = ligne.jours_sans_echange;
  if (typeof silence === "number" && silence > seuilDeSilence(ligne.etape_nom)) {
    return "qui_pourrit";
  }

  // Une prochaine action déjà posée (même future) suffit : l'affaire est tenue.
  const tenue = Boolean(ligne.prochaine_action || ligne.date_prochain_suivi);
  if (!tenue && estEngagee(ligne.etape_nom) && typeof silence === "number") {
    return "sans_prochaine_action";
  }

  return "ok";
}

/** L'ordre d'attaque de la journée. Plus petit = plus urgent. */
export const RANG_ETAT: Record<EtatSuivi, number> = {
  en_retard: 0,
  qui_pourrit: 1,
  sans_prochaine_action: 2,
  ok: 3,
};

export const LIBELLE_ETAT: Record<EtatSuivi, string> = {
  en_retard: "En retard",
  qui_pourrit: "Sans nouvelle",
  sans_prochaine_action: "Sans prochaine action",
  ok: "À jour",
};

/**
 * Trie une liste par urgence, puis par ce qui coûte le plus cher à perdre.
 * À état égal, le montant décide : deux affaires également en retard ne se
 * valent pas.
 */
export function trierParUrgence(lignes: LigneSuivi[]): Array<LigneSuivi & { etat: EtatSuivi }> {
  return lignes
    .map((l) => ({ ...l, etat: classer(l) }))
    .sort((a, b) => {
      const parEtat = RANG_ETAT[a.etat] - RANG_ETAT[b.etat];
      if (parEtat !== 0) return parEtat;

      const retard = (b.jours_de_retard ?? 0) - (a.jours_de_retard ?? 0);
      if (retard !== 0) return retard;

      const valeur = (b.montant ?? 0) + (b.mrr ?? 0) * 12 - ((a.montant ?? 0) + (a.mrr ?? 0) * 12);
      if (valeur !== 0) return valeur;

      return (b.jours_sans_echange ?? 0) - (a.jours_sans_echange ?? 0);
    });
}
