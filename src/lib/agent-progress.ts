/**
 * Compteurs de progression du portail agent.
 *
 * Deux compteurs, un par capacité déléguée (cf. `require-capability`) :
 *   - `qualify`            → ce que l'agent a trié, et ce que l'admin en a fait ;
 *   - `marketing_pipeline` → où en sont ses entreprises dans les 4 étapes de production.
 *
 * Tout ce qui est *calcul* vit ici, en pur, pour que la route API n'ait qu'à
 * poser les requêtes et que l'UI puisse partager les types. Les agrégats sont
 * dérivés des mêmes données que les écrans correspondants (file de
 * qualification, board marketing), donc les chiffres du dashboard ne peuvent
 * pas diverger de ceux des écrans.
 */

/* ── Marketing pipeline ─────────────────────────────────────────────────── */

export type MarketingStageId = "enrich" | "validation" | "site" | "audit";

/**
 * Les 4 étapes du board agent, dans l'ordre. Miroir d'`AGENT_STAGES`
 * (`components/marketing-pipeline/PipelineMatrix`) — dupliqué plutôt
 * qu'importé parce que ce module est lu côté serveur et que le board traîne
 * lucide-react et sa feuille de style avec lui.
 */
export const MARKETING_STAGES: Array<{ id: MarketingStageId; label: string; color: string }> = [
  { id: "enrich", label: "Enrichissement", color: "#0E93A6" },
  { id: "validation", label: "Validation données", color: "#7A5AE0" },
  { id: "site", label: "Site démo", color: "#2F7AE0" },
  { id: "audit", label: "Audit", color: "#C8881F" },
];

/** Nombre d'étapes à franchir pour qu'une entreprise soit terminée. */
export const MARKETING_STEPS_PER_COMPANY = MARKETING_STAGES.length;

export type MarketingProgress = {
  /** Entreprises attribuées à l'agent présentes sur son board. */
  total: number;
  /** Les 4 étapes franchies : plus rien à faire. */
  terminees: number;
  en_cours: number;
  /** Combien d'entreprises attendent sur chaque étape. */
  par_etape: Record<MarketingStageId, number>;
  /** Étapes franchies / étapes à franchir, toutes entreprises confondues. */
  etapes_faites: number;
  etapes_total: number;
  /** `etapes_faites / etapes_total`, en pourcentage entier. */
  pourcentage: number;
};

/**
 * Agrège la progression à partir du board (`buildBoard`), dont chaque ligne
 * porte une colonne 1..5 : la colonne est l'étape en cours, et 5 signifie que
 * les 4 étapes sont franchies. Le nombre d'étapes faites vaut donc
 * `colonne - 1`.
 */
export function summarizeMarketingBoard(items: Array<{ column?: number | null }>): MarketingProgress {
  const par_etape: Record<MarketingStageId, number> = {
    enrich: 0,
    validation: 0,
    site: 0,
    audit: 0,
  };

  let terminees = 0;
  let etapes_faites = 0;

  for (const item of items) {
    const raw = Number(item.column);
    const column = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 5) : 1;
    etapes_faites += column - 1;

    if (column > MARKETING_STEPS_PER_COMPANY) terminees += 1;
    else par_etape[MARKETING_STAGES[column - 1].id] += 1;
  }

  const total = items.length;
  const etapes_total = total * MARKETING_STEPS_PER_COMPANY;

  return {
    total,
    terminees,
    en_cours: total - terminees,
    par_etape,
    etapes_faites,
    etapes_total,
    pourcentage: etapes_total > 0 ? Math.round((etapes_faites / etapes_total) * 100) : 0,
  };
}

/* ── Qualification ──────────────────────────────────────────────────────── */

/** Ce que la base sait compter directement, une requête `count` par ligne. */
export type QualificationCounts = {
  /** Décisions prises par l'agent, qualifications et masquages confondus. */
  traitees: number;
  qualifiees: number;
  /** Décisions que l'admin n'a pas encore revues. */
  en_attente: number;
  /** Décisions que l'admin a confirmées telles quelles. */
  validees: number;
  aujourdhui: number;
  semaine: number;
  /** Entreprises restant dans la file (approximatif, cf. la route). */
  file_restante: number;
};

export type QualificationProgress = QualificationCounts & {
  masquees: number;
  /** Décisions que l'admin a corrigées en les revoyant. */
  corrigees: number;
  revues: number;
  /** Part des décisions revues qui ont été confirmées. `null` si aucune revue. */
  precision: number | null;
  /** Part des entreprises triées que l'agent a proposées à la qualification. */
  taux_qualification: number | null;
};

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/**
 * Complète les compteurs bruts par ce qui s'en déduit. `masquees` et
 * `corrigees` sont déduits plutôt que comptés : une décision est soit
 * `qualify` soit `skip`, et une revue est soit `confirmed` soit `overridden` —
 * deux requêtes de moins, et des totaux qui tombent juste par construction.
 */
export function summarizeQualification(counts: QualificationCounts): QualificationProgress {
  const masquees = Math.max(0, counts.traitees - counts.qualifiees);
  const revues = Math.max(0, counts.traitees - counts.en_attente);
  const corrigees = Math.max(0, revues - counts.validees);

  return {
    ...counts,
    masquees,
    corrigees,
    revues,
    precision: pct(counts.validees, revues),
    taux_qualification: pct(counts.qualifiees, counts.traitees),
  };
}

/* ── Bornes de temps ────────────────────────────────────────────────────── */

/**
 * « Aujourd'hui » et « cette semaine » sont ceux de l'agent, pas ceux du
 * serveur : Vercel tourne en UTC, donc un tri fait à 23h30 à Paris compterait
 * pour le lendemain. On calcule les bornes dans le fuseau français.
 */
export const AGENT_TIMEZONE = "Europe/Paris";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Décalage du fuseau par rapport à UTC, en ms, à l'instant donné. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `hour` peut valoir 24 pour minuit selon l'implémentation d'Intl.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Minuit, dans le fuseau de l'agent, du jour où l'on se trouve. */
export function dayStartIso(now: Date = new Date(), timeZone: string = AGENT_TIMEZONE): string {
  const offset = zoneOffsetMs(now, timeZone);
  const local = now.getTime() + offset;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - offset).toISOString();
}

/**
 * Minuit du lundi de la semaine en cours, dans le fuseau de l'agent. Le retour
 * à l'heure d'hiver peut décaler cette borne d'une heure ; sans importance pour
 * un compteur d'encouragement.
 */
export function weekStartIso(now: Date = new Date(), timeZone: string = AGENT_TIMEZONE): string {
  const dayStart = new Date(dayStartIso(now, timeZone));
  const local = new Date(dayStart.getTime() + zoneOffsetMs(dayStart, timeZone));
  // getUTCDay sur l'instant décalé = le jour de la semaine local. 0 = dimanche.
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - sinceMonday * DAY_MS).toISOString();
}

/* ── Réponse de /api/agent/progress ─────────────────────────────────────── */

export type AgentProgress = {
  capabilities: { qualify: boolean; marketing_pipeline: boolean };
  /** `null` quand la capacité n'est pas accordée (ou la migration pas appliquée). */
  qualification: QualificationProgress | null;
  marketing_pipeline: MarketingProgress | null;
};
