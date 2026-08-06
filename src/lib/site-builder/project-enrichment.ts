/**
 * Variables Claude Design héritées de l'enrichissement du projet
 * `lead_magnet_projects` (sortie de l'edge function `enrich-lead-magnet`).
 *
 * Partagé par les deux résolveurs (preview éditeur + publication) pour éviter
 * qu'ils divergent. Ne consomme QUE des colonnes écrites par l'edge function
 * sur `lead_magnet_projects` :
 *   - `logo_url`
 *   - `service_tags_snapshot`
 *   - `stat_years_experience` / `stat_satisfied_clients` /
 *     `stat_installations_completed` / `stat_rge_count`
 *   - `variables.surrounding_cities` (villes desservies autour)
 *
 * Précédence : ces valeurs complètent la base `entreprises`/overrides mais ne
 * doivent pas écraser une valeur déjà posée manuellement dans le jsonb
 * `variables` (d'où `fillIfEmpty` pour les scalaires). Les stats du projet
 * priment en revanche sur `entreprises.stats` — la source de vérité des chiffres
 * clés est l'enrichissement.
 */
import type { StatItem } from "./menu-overrides";

export interface ProjectEnrichmentRow {
  logo_url?: string | null;
  service_tags_snapshot?: string[] | string | null;
  /** Estimations : dérivées du site ou du nombre d'avis Google. */
  stat_years_experience?: string | null;
  stat_satisfied_clients?: string | null;
  stat_installations_completed?: string | null;
  stat_rge_count?: string | null;
  /**
   * Chiffres CONFIRMÉS par le client, prioritaires sur les estimations
   * ci-dessus (cf. `effectiveStat`). Optionnelles : la migration
   * `20260805_stats_officielles.sql` s'applique à la main, et l'absence de
   * colonne doit rester sans effet.
   */
  stat_years_experience_official?: string | null;
  stat_satisfied_clients_official?: string | null;
  stat_installations_completed_official?: string | null;
  stat_rge_count_official?: string | null;
  variables?: Record<string, unknown> | null;
}

export interface ProjectEnrichmentResult {
  /** Tags issus du snapshot du projet (source de vérité de l'enrichissement),
   *  ou null si le projet n'en a pas — le caller retombe alors sur
   *  `entreprises.service_tags`. */
  serviceTags: string[] | null;
  /** Bloc stats construit depuis les `stat_*` du projet, ou null si aucune. */
  stats: StatItem[] | null;
}

/** Une stat "vide" côté enrichissement : "", "0", "-", "—". */
function isEmptyStat(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = String(v).trim();
  return t === "" || t === "0" || t === "-" || t === "—";
}

function statValue(v: string | null | undefined): string {
  return isEmptyStat(v) ? "" : String(v).trim();
}

function fillIfEmpty(vars: Record<string, string>, key: string, value: string): void {
  if (!value) return;
  const current = vars[key];
  if (current === undefined || current === "") vars[key] = value;
}

function normalizeTags(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
  }
  if (typeof raw === "string" && raw.trim().length > 0) return [raw.trim()];
  return [];
}

/**
 * Texte "villes autour" pour `zones_desservies` : privilégie le tableau
 * `surrounding_cities` (joint par ", "), sinon `surrounding_cities_text`
 * (que l'edge joint par "; " — on uniformise en ", " pour l'affichage).
 */
function surroundingCitiesText(variables: Record<string, unknown> | null | undefined): string {
  if (!variables || typeof variables !== "object") return "";
  const arr = variables["surrounding_cities"];
  if (Array.isArray(arr)) {
    const cities = arr
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim());
    if (cities.length > 0) return cities.join(", ");
  }
  const text = variables["surrounding_cities_text"];
  if (typeof text === "string" && text.trim().length > 0) {
    return text.split(/\s*;\s*/).filter(Boolean).join(", ");
  }
  return "";
}

const STAT_FIELDS: Array<{
  key: keyof ProjectEnrichmentRow;
  /** Colonne portant le chiffre CONFIRMÉ par le client, prioritaire. */
  officialKey: keyof ProjectEnrichmentRow;
  label: string;
  order: number;
}> = [
  {
    key: "stat_years_experience",
    officialKey: "stat_years_experience_official",
    label: "Années d'expérience",
    order: 10,
  },
  {
    key: "stat_satisfied_clients",
    officialKey: "stat_satisfied_clients_official",
    label: "Clients satisfaits",
    order: 20,
  },
  {
    key: "stat_installations_completed",
    officialKey: "stat_installations_completed_official",
    label: "Installations réalisées",
    order: 30,
  },
  { key: "stat_rge_count", officialKey: "stat_rge_count_official", label: "Qualifications", order: 40 },
];

/**
 * Le chiffre à afficher : celui confirmé par le client s'il existe, sinon
 * l'estimation.
 *
 * Les estimations sont dérivées du nombre d'avis Google (`× 1,4`, puis `× 2` pour
 * les installations) quand le site du client ne publie rien d'exploitable. C'est
 * assumé pour une démo privée, mais dès que le client donne ses vrais chiffres ils
 * doivent prendre le dessus — et l'enrichissement n'écrit jamais les colonnes
 * `_official`, donc une relance ne peut pas les effacer.
 */
export function effectiveStat(
  proj: ProjectEnrichmentRow,
  key: keyof ProjectEnrichmentRow,
  officialKey: keyof ProjectEnrichmentRow,
): string {
  const official = statValue(proj[officialKey] as string | null | undefined);
  return official || statValue(proj[key] as string | null | undefined);
}

function buildStatsFromProject(proj: ProjectEnrichmentRow): StatItem[] | null {
  const stats: StatItem[] = [];
  for (const f of STAT_FIELDS) {
    const v = effectiveStat(proj, f.key, f.officialKey);
    if (v) stats.push({ label: f.label, value: v, display_order: f.order });
  }
  return stats.length > 0 ? stats : null;
}

/**
 * Applique l'enrichissement du projet sur la map de variables (mutation en
 * place) et renvoie les tags/stats dérivés pour que le caller les fusionne
 * dans `__service_tags` / `__stats` / `entreprise.services`.
 *
 * À appeler APRÈS avoir posé la base entreprises + overrides + le spread du
 * jsonb `variables`, et AVANT `applyEnrichmentVariables` (repli
 * `automated_enrichment`) pour que la sortie edge prime sur l'ancien
 * enrichissement.
 */
export function applyProjectEnrichment(
  vars: Record<string, string>,
  proj: ProjectEnrichmentRow,
): ProjectEnrichmentResult {
  // Logo : override du projet prioritaire sur entreprises.logo_url (déjà posé).
  if (typeof proj.logo_url === "string" && proj.logo_url.trim().length > 0) {
    vars["entreprise.logo_url"] = proj.logo_url.trim();
  }

  // Chiffres clés (stat_*). fillIfEmpty : un override manuel déjà présent dans
  // le jsonb `variables` reste prioritaire ; sinon la valeur enrichie gagne sur
  // le repli automated_enrichment (annee_experience), appliqué ensuite.
  // Un chiffre confirmé par le client passe devant l'estimation (cf. effectiveStat).
  fillIfEmpty(
    vars,
    "entreprise.annee_experience",
    effectiveStat(proj, "stat_years_experience", "stat_years_experience_official"),
  );
  fillIfEmpty(
    vars,
    "entreprise.clients_count",
    effectiveStat(proj, "stat_satisfied_clients", "stat_satisfied_clients_official"),
  );
  fillIfEmpty(
    vars,
    "entreprise.installations",
    effectiveStat(proj, "stat_installations_completed", "stat_installations_completed_official"),
  );
  fillIfEmpty(
    vars,
    "entreprise.qualifications",
    effectiveStat(proj, "stat_rge_count", "stat_rge_count_official"),
  );

  // Zones desservies : villes autour extraites par l'enrichissement.
  fillIfEmpty(vars, "entreprise.zones_desservies", surroundingCitiesText(proj.variables));

  const snapshot = normalizeTags(proj.service_tags_snapshot);
  return {
    serviceTags: snapshot.length > 0 ? snapshot : null,
    stats: buildStatsFromProject(proj),
  };
}
