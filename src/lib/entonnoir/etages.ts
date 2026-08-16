/**
 * L'entonnoir de la campagne d'août — huit étages, et surtout la PERTE entre eux.
 *
 * POURQUOI CE MODULE EST PUR
 * Tout ce qui est *calcul* vit ici, sans Supabase ni React, pour deux raisons :
 * la route API n'a plus qu'à poser ses requêtes, et l'écran partage exactement
 * les mêmes types — un chiffre affiché ne peut donc pas diverger du chiffre
 * mesuré. Même découpage que `src/lib/agent-progress.ts`.
 *
 * DEUX RÈGLES QUI NE SE NÉGOCIENT PAS
 *
 * 1. Un zéro et une absence de mesure ne sont pas la même chose. GA4 muet,
 *    colonne jamais renseignée, table absente : dans ces cas `total` vaut
 *    `null`, jamais `0`. Confondre les deux le 25 août ferait conclure « la
 *    cohorte B n'ouvre jamais ses documents » alors que personne ne mesure.
 *
 * 2. On compare les cohortes AU MÊME ÂGE, jamais à date absolue. La cohorte A
 *    est démarchée du 17 au 19, la B du 20 au 22 : au 26 août, A a cinq jours
 *    de relances de plus que B. Les comparer à date opposerait deux durées, pas
 *    deux offres. L'âge se compte depuis `premiere_touche_le`, et une entreprise
 *    trop jeune pour un âge donné n'entre pas dans le dénominateur.
 */

/* ── Cohortes ───────────────────────────────────────────────────────────── */

export const COHORTES = ["A_site_faible", "B_sans_site"] as const;
export type Cohorte = (typeof COHORTES)[number];

export const LIBELLE_COHORTE: Record<Cohorte, string> = {
  A_site_faible: "A · site faible",
  B_sans_site: "B · sans site",
};

/** Lettre affichée dans les tableaux serrés, où « A_site_faible » ne rentre pas. */
export const LETTRE_COHORTE: Record<Cohorte, string> = {
  A_site_faible: "A",
  B_sans_site: "B",
};

/** Teinte de cohorte. Deux couleurs franchement distinctes : on les lit côte à côte. */
export const TEINTE_COHORTE: Record<Cohorte, string> = {
  A_site_faible: "var(--magic)",
  B_sans_site: "var(--info)",
};

/** `null` = les deux cohortes. Toute autre valeur est refusée, pas devinée. */
export function lireCohorte(valeur: string | null | undefined): Cohorte | null {
  const v = (valeur ?? "").trim();
  return (COHORTES as readonly string[]).includes(v) ? (v as Cohorte) : null;
}

/* ── Les huit étages ────────────────────────────────────────────────────── */

export type CleEtage =
  | "ciblee"
  | "touchee"
  | "repondu"
  | "document_ouvert"
  | "conversation"
  | "offre_envoyee"
  | "decision_attendue"
  | "payee";

export type DefinitionEtage = {
  cle: CleEtage;
  libelle: string;
  /** Entête du tableau par âge, où l'on n'a que quelques caractères. */
  court: string;
  /**
   * D'où vient le chiffre, en clair. Affiché, pas seulement documenté : c'est
   * ce qui permet de ne pas croire un chiffre qu'on ne saurait pas expliquer.
   */
  source: string;
  /**
   * Raison pour laquelle cet étage ne peut PAS être daté entreprise par
   * entreprise, ou `null` s'il peut l'être. Sans date, pas de lecture par âge :
   * la colonne affiche « — » et dit pourquoi, au lieu d'un chiffre faux.
   */
  nonDatee: string | null;
};

export const ETAGES: readonly DefinitionEtage[] = [
  {
    cle: "ciblee",
    libelle: "Ciblée",
    court: "Ciblée",
    source: "entreprises.cohorte_demarchage",
    // L'âge se compte DEPUIS la première touche : avant elle, une entreprise
    // n'a pas d'âge. « Ciblée » n'apparaît donc pas dans la lecture par âge.
    nonDatee: "l'âge se compte depuis la première touche",
  },
  {
    cle: "touchee",
    libelle: "Touchée",
    court: "Touchée",
    source: "entreprises.premiere_touche_le",
    nonDatee: null,
  },
  {
    cle: "repondu",
    libelle: "A répondu",
    court: "Répondu",
    source:
      "réponses déclarées : attente de séquence levée, issue d'appel où quelqu'un a parlé, sales_pipeline_state.replied",
    nonDatee: null,
  },
  {
    cle: "document_ouvert",
    libelle: "Document ouvert",
    court: "Doc ouvert",
    // Deux choses sont dites ici parce que les deux changent la lecture, et
    // qu'un `source` faux est pire qu'un `source` absent : il fait croire un
    // chiffre.
    //
    // La FENÊTRE d'abord : une visite du 18 août n'est plus visible le 26, donc
    // la décroissance du signal n'est pas un désintérêt des prospects.
    //
    // Le PÉRIMÈTRE ensuite, et c'est le piège. `intentBySite` attribue les
    // sessions GA4 par NOM D'HÔTE de site de démo : seule une visite sur la
    // démo d'un client se rattache à une entreprise. La plaquette vit sur
    // l'hôte du CRM, sans ligne dans `sites` — GA4 voit ses ouvertures et ne
    // sait pas à qui les rattacher. C'est le jeton par prospect qui fait ce
    // lien, et son compteur `plaquette_vues` est la seconde source de cet
    // étage : sans lui, la cohorte B — définie par l'ABSENCE de site — serait
    // structurellement vide, et un entonnoir plat se lirait comme un
    // désintérêt des prospects alors qu'il ne dirait que notre aveuglement.
    //
    // Le rapport d'audit, lui, n'est toujours pas compté : son compteur existe
    // (`vues`) mais rien ne le distingue d'une ouverture faite par l'agent.
    source:
      "GA4 sur 7 jours glissants pour les sites de démo, plus le compteur d'ouvertures des plaquettes",
    // Datable en théorie, faux en pratique : hors de la fenêtre GA4 on ne sait
    // plus SI la visite a eu lieu, donc encore moins QUAND. Une lecture par âge
    // ne verrait que les entreprises touchées récemment et donnerait
    // mécaniquement l'avantage à la cohorte la plus jeune.
    nonDatee: "hors de la fenêtre GA4 de 7 jours, on ne sait plus quand la visite a eu lieu",
  },
  {
    cle: "conversation",
    libelle: "Conversation",
    court: "Conversation",
    source: "prospection_tasks : appel marqué fait",
    nonDatee: null,
  },
  {
    cle: "offre_envoyee",
    libelle: "Offre envoyée",
    court: "Offre",
    source: "opportunite_offres",
    nonDatee: null,
  },
  {
    cle: "decision_attendue",
    libelle: "Décision attendue",
    court: "Décision",
    source: "étape de l'affaire (rôle RDV ou proposition), datée par opportunite_etapes_journal",
    nonDatee: null,
  },
  {
    cle: "payee",
    libelle: "Payée",
    court: "Payée",
    source: "étape de l'affaire (rôle signé), datée par opportunite_etapes_journal",
    nonDatee: null,
  },
];

export const ETAGE_PAR_CLE: Record<CleEtage, DefinitionEtage> = ETAGES.reduce(
  (acc, e) => {
    acc[e.cle] = e;
    return acc;
  },
  {} as Record<CleEtage, DefinitionEtage>,
);

/* ── Ce que la route doit fournir ───────────────────────────────────────── */

/**
 * Une entreprise de la campagne, réduite à ce que l'entonnoir a besoin de
 * savoir d'elle.
 *
 * `atteints` : une clé PRÉSENTE signifie que l'étage est atteint. Sa valeur est
 * l'instant où il l'a été, ou `null` quand la source ne sait pas dater (l'étage
 * compte alors dans le total, mais pas dans la lecture par âge). C'est
 * exactement pour ça que c'est une `Map` et non un objet : `undefined` (jamais
 * atteint) et `null` (atteint, non daté) ne doivent pas se confondre.
 */
export type FaitsEntreprise = {
  id: number;
  nom: string | null;
  cohorte: Cohorte;
  premiereTouche: string | null;
  atteints: Map<CleEtage, string | null>;
  /** À part de l'entonnoir : ce qui en sort. */
  sortie: "perdu" | "nurturing" | null;
};

/**
 * Les sources qu'on n'a PAS pu lire, et pourquoi — en clair, pour l'écran.
 * Une clé absente veut dire « mesurée » ; une clé présente rend l'étage `null`
 * au lieu de zéro.
 */
export type SourcesMuettes = Partial<Record<CleEtage, string>>;

/**
 * Les étages comptés mais non datables, et pourquoi. Deux origines : la
 * définition de l'étage (fenêtre GA4) et l'état de la base au moment de la
 * mesure (journal d'étapes absent). Un étage non daté garde son total et perd
 * sa colonne dans la lecture par âge — la moitié d'une vérité, dite comme telle.
 */
export const NON_DATEES_STATIQUES: SourcesMuettes = ETAGES.reduce((acc, e) => {
  if (e.nonDatee) acc[e.cle] = e.nonDatee;
  return acc;
}, {} as SourcesMuettes);

/* ── L'entonnoir ────────────────────────────────────────────────────────── */

export type Etage = {
  cle: CleEtage;
  libelle: string;
  /** `null` = source muette. Voir la règle 1 en tête de fichier. */
  total: number | null;
  /**
   * Perte par rapport à l'étage mesuré précédent (`depuis`), en entreprises.
   * Négative quand cet étage compte PLUS de monde que le précédent : ce n'est
   * pas une anomalie de calcul mais un trou de journalisation (on a signé une
   * entreprise dont personne n'a enregistré la réponse). L'écran le montre tel
   * quel — le masquer reviendrait à cacher que la mesure est incomplète.
   */
  perte: number | null;
  pertePct: number | null;
  /** L'étage auquel la perte se compare. Pas toujours le précédent : une source muette est sautée. */
  depuis: CleEtage | null;
  /** Part des entreprises ciblées, en %. */
  part: number | null;
  source: string;
  /** Pourquoi la source est muette, ou `null` si elle parle. */
  muette: string | null;
};

const pourcent = (part: number, base: number): number | null =>
  base > 0 ? Math.round((part / base) * 1000) / 10 : null;

/**
 * Les huit étages et leur perte, pour la population fournie.
 *
 * La perte se compare au dernier étage MESURÉ, pas au précédent : si GA4 est
 * muet, « Conversation » se compare à « A répondu » et l'entonnoir reste
 * lisible. Sans ça, une panne d'analytics ferait afficher une perte de 100 %
 * puis un gain de l'infini, et l'écran deviendrait inexploitable le jour où on
 * en a le plus besoin.
 */
export function construireEntonnoir(faits: FaitsEntreprise[], muettes: SourcesMuettes = {}): Etage[] {
  const base = faits.length;

  let depuisCle: CleEtage | null = null;
  let depuisTotal: number | null = null;

  return ETAGES.map((def) => {
    const muette = muettes[def.cle] ?? null;
    // « Ciblée » est une tautologie : être dans cette liste, c'est être ciblée.
    // On ne demande donc pas à la route de le marquer entreprise par entreprise.
    const total = muette
      ? null
      : def.cle === "ciblee"
        ? base
        : faits.filter((f) => f.atteints.has(def.cle)).length;

    const perte = total != null && depuisTotal != null ? depuisTotal - total : null;
    const etage: Etage = {
      cle: def.cle,
      libelle: def.libelle,
      total,
      perte,
      pertePct: perte != null && depuisTotal ? pourcent(perte, depuisTotal) : null,
      depuis: total != null ? depuisCle : null,
      part: total != null ? pourcent(total, base) : null,
      source: def.source,
      muette,
    };

    if (total != null) {
      depuisCle = def.cle;
      depuisTotal = total;
    }
    return etage;
  });
}

/* ── La sortie ──────────────────────────────────────────────────────────── */

export type Sortie = { perdu: number; nurturing: number; total: number };

/** Ce qui quitte l'entonnoir — perdu pour de bon, ou remis à plus tard. */
export function compterSorties(faits: FaitsEntreprise[]): Sortie {
  let perdu = 0;
  let nurturing = 0;
  for (const f of faits) {
    if (f.sortie === "perdu") perdu += 1;
    else if (f.sortie === "nurturing") nurturing += 1;
  }
  return { perdu, nurturing, total: perdu + nurturing };
}

/* ── La lecture par âge ─────────────────────────────────────────────────── */

/** Les quatre âges de comparaison. J+14 déborde la campagne : c'est voulu, il se lira en septembre. */
export const AGES = [1, 3, 7, 14] as const;

const JOUR_MS = 86_400_000;

/** Âge en jours pleins, ou `null` si la date est absente ou illisible. */
export function ageEnJours(depuis: string | null | undefined, maintenant: Date): number | null {
  if (!depuis) return null;
  const t = new Date(depuis).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((maintenant.getTime() - t) / JOUR_MS);
}

export type CaseAge = {
  cle: CleEtage;
  /** `null` = non mesurable à cet âge (source muette, ou étage non datable). */
  total: number | null;
  /** Part des ÉLIGIBLES, en % — le seul dénominateur honnête. */
  part: number | null;
};

export type PointAge = {
  cohorte: Cohorte;
  jour: number;
  /**
   * Entreprises assez vieilles pour être jugées à cet âge. Une entreprise
   * touchée hier ne peut pas avoir raté son J+7 : elle ne compte ni au
   * numérateur ni au dénominateur.
   */
  eligibles: number;
  etages: CaseAge[];
};

/**
 * Une ligne par cohorte et par âge : « à J+3, combien de celles qui avaient
 * atteint cet âge avaient répondu ? ».
 *
 * `maintenant` est un paramètre, pas un `new Date()` planqué : la fonction doit
 * être testable, et la mesure doit pouvoir être rejouée à une date donnée.
 */
export function lectureParAge(
  faits: FaitsEntreprise[],
  {
    muettes = {},
    nonDatees = NON_DATEES_STATIQUES,
    maintenant = new Date(),
  }: { muettes?: SourcesMuettes; nonDatees?: SourcesMuettes; maintenant?: Date } = {},
): PointAge[] {
  const cohortes = COHORTES.filter((c) => faits.some((f) => f.cohorte === c));
  const points: PointAge[] = [];

  for (const jour of AGES) {
    for (const cohorte of cohortes) {
      const eligibles = faits.filter((f) => {
        if (f.cohorte !== cohorte) return false;
        const age = ageEnJours(f.premiereTouche, maintenant);
        return age != null && age >= jour;
      });

      points.push({
        cohorte,
        jour,
        eligibles: eligibles.length,
        etages: ETAGES.filter((def) => def.cle !== "ciblee").map((def) => {
          if (muettes[def.cle] || nonDatees[def.cle]) return { cle: def.cle, total: null, part: null };
          const total = eligibles.filter((f) => {
            const le = f.atteints.get(def.cle);
            if (le == null) return false; // jamais atteint, ou atteint sans date
            const delai = ageEnJours(f.premiereTouche, new Date(le));
            // Un jalon antérieur à la première touche (rattrapage, import) est
            // compté à J+0 : il est acquis, il ne doit pas disparaître.
            return delai != null && delai <= jour;
          }).length;
          return { cle: def.cle, total, part: pourcent(total, eligibles.length) };
        }),
      });
    }
  }

  return points;
}

/* ── La réponse de /api/agent/entonnoir ─────────────────────────────────── */

export type ReponseEntonnoir = {
  /** La cohorte demandée, ou `null` pour les deux. */
  cohorte: Cohorte | null;
  etages: Etage[];
  parAge: PointAge[];
  /** Étages comptés mais non datables — la lecture par âge doit le dire. */
  nonDatees: SourcesMuettes;
  sortie: Sortie;
  /** Effectif par cohorte, quel que soit le filtre — le repère de lecture. */
  effectifs: Record<Cohorte, number>;
  /** Instant de la mesure, affiché : un tableau de bord sans date se périme en silence. */
  mesureLe: string;
  /** Empêche la campagne entière : colonne absente, table manquante… */
  indisponible: string | null;
};
