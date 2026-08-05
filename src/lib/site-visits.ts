/**
 * Visites de démo — types partagés et lecture du signal.
 *
 * Le calcul de « température » vit ici, et pas dans le composant qui l'affiche,
 * parce que trois endroits en dépendent et doivent s'accorder : le panneau du
 * cockpit, le tri de la file d'appel, et (lot 3) le déclencheur d'automatisation.
 * Une entreprise classée « chaude » dans la file doit l'être aussi dans le
 * panneau, sinon l'ordre d'appel devient incompréhensible.
 */

/** Une session de visite, telle que l'API la renvoie au CRM. */
export interface SiteVisit {
  id: string;
  entreprise_id: number | null;
  contact_id: string | null;
  /** Nom du contact résolu par l'API quand le lien portait un jeton. */
  contact_name: string | null;
  host: string;
  entry_path: string;
  paths: string[];
  page_views: number;
  referrer: string | null;
  device: string | null;
  duration_ms: number;
  started_at: string;
  last_seen_at: string;
}

/** Agrégat par entreprise (vue `site_visit_summary`). */
export interface SiteVisitSummary {
  entreprise_id: number;
  visits: number;
  total_duration_ms: number;
  last_visit_at: string | null;
  first_visit_at: string | null;
  distinct_days: number;
  distinct_contacts: number;
  saw_intent_page: boolean;
}

export type VisitHeat = "none" | "cold" | "warm" | "hot" | "blazing";

/**
 * Une session plus courte que ça ne prouve rien : c'est le temps qu'il faut
 * pour ouvrir un lien, comprendre que ce n'est pas ce qu'on cherchait, et
 * fermer l'onglet. La compter comme un signal remplirait la file d'appel de
 * faux positifs, ce qui est la façon la plus sûre de faire ignorer la file.
 */
export const NOISE_DURATION_MS = 30_000;

/** Au-delà, la personne a lu — même si elle n'a vu qu'une page. */
const ENGAGED_DURATION_MS = 45_000;

/** Ou bien elle a navigué, ce qui vaut autant qu'une longue lecture. */
const ENGAGED_PAGE_VIEWS = 3;

export interface HeatVerdict {
  heat: VisitHeat;
  /** Phrase courte affichable telle quelle, ex. « Revenu 2 jours différents ». */
  reason: string;
}

/**
 * Classe une entreprise à partir de son agrégat.
 *
 * L'ordre des tests est l'ordre de force du signal, du plus fort au plus
 * faible ; le premier qui matche gagne, et sa raison est celle affichée.
 */
export function heatOf(s: SiteVisitSummary | null | undefined): HeatVerdict {
  if (!s || s.visits === 0) return { heat: "none", reason: "Démo jamais ouverte" };

  // Plusieurs personnes identifiées : la démo a circulé en interne, quelqu'un
  // l'a montrée à quelqu'un d'autre. C'est le meilleur signal du lot.
  if (s.distinct_contacts >= 2) {
    return { heat: "blazing", reason: `${s.distinct_contacts} personnes ont ouvert la démo` };
  }

  // Revenu un autre jour ET allé chercher les tarifs : intention d'achat.
  if (s.distinct_days >= 2 && s.saw_intent_page) {
    return { heat: "blazing", reason: "Revenu voir les tarifs un autre jour" };
  }

  // Le retour différé, seul, reste le signal fort classique : personne ne
  // rouvre par accident un lien reçu la veille.
  if (s.distinct_days >= 2) {
    return { heat: "hot", reason: `Revenu ${s.distinct_days} jours différents` };
  }

  if (s.saw_intent_page) {
    return { heat: "hot", reason: "A consulté une page tarifs / contact" };
  }

  if (s.total_duration_ms >= ENGAGED_DURATION_MS) {
    return { heat: "warm", reason: `A lu ${formatDuration(s.total_duration_ms)}` };
  }

  if (s.visits >= 2) {
    return { heat: "warm", reason: `${s.visits} ouvertures` };
  }

  return { heat: "cold", reason: "Ouverture brève" };
}

/** Vrai si la session est trop courte pour valoir un signal (cf. NOISE_DURATION_MS). */
export function isNoise(v: SiteVisit): boolean {
  return v.duration_ms < NOISE_DURATION_MS && v.page_views < ENGAGED_PAGE_VIEWS;
}

/** Poids de tri de la file d'appel — le plus chaud d'abord. */
export const HEAT_RANK: Record<VisitHeat, number> = {
  blazing: 4,
  hot: 3,
  warm: 2,
  cold: 1,
  none: 0,
};

/** Libellé court pour la pastille du cockpit. */
export const HEAT_LABEL: Record<VisitHeat, string> = {
  blazing: "Très chaud",
  hot: "Chaud",
  warm: "Tiède",
  cold: "Vu",
  none: "—",
};

/** `95 000` → « 1 min 35 ». Les millisecondes n'intéressent personne au téléphone. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m} min` : `${m} min ${s}`;
}

/**
 * `/tarifs` → « Tarifs ». Les chemins bruts sont illisibles à voix haute
 * pendant un appel ; on affiche le dernier segment, capitalisé.
 */
export function prettyPath(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "");
  if (!clean || clean === "/") return "Accueil";
  const last = clean.split("/").filter(Boolean).pop() ?? "";
  const words = last.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Accueil";
}
