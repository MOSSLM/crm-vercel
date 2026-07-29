/**
 * Replis des chiffres clés vers les tokens scalaires.
 *
 * Les quatre `{{ entreprise.annee_experience | clients_count | installations |
 * qualifications }}` n'étaient alimentés que par les colonnes
 * `lead_magnet_projects.stat_*`. Or `entreprises.stats` (saisie manuelle) et
 * `sites.content_overrides.stats` (override par site) portent exactement les
 * mêmes chiffres — mais n'alimentaient QUE le JSON `__stats`, lu par les seules
 * sections « managed », jamais par un design Claude brut. Une entreprise dont
 * les chiffres étaient renseignés à la main affichait donc des cases vides.
 *
 * Ce module fait le pont : à partir de la liste `__stats` déjà résolue, il
 * remplit les tokens scalaires encore vides, par correspondance de libellé.
 * Fill-only : ce qui vient du projet ou d'une saisie manuelle reste prioritaire.
 */
import type { StatItem } from "./menu-overrides";

/**
 * Libellé → token. Les clés sont comparées normalisées (accents, casse et
 * ponctuation retirés), donc « Années d'expérience », « annees d experience »
 * et « ANNÉES D'EXPÉRIENCE » tombent sur la même entrée.
 */
const TOKEN_BY_LABEL: Readonly<Record<string, string>> = {
  "annees d experience": "entreprise.annee_experience",
  "annee d experience": "entreprise.annee_experience",
  "annees experience": "entreprise.annee_experience",
  "experience": "entreprise.annee_experience",
  "clients satisfaits": "entreprise.clients_count",
  "clients": "entreprise.clients_count",
  "installations realisees": "entreprise.installations",
  "installations": "entreprise.installations",
  "chantiers realises": "entreprise.installations",
  "interventions": "entreprise.installations",
  "qualifications": "entreprise.qualifications",
  "certifications": "entreprise.qualifications",
};

/** Clé de comparaison d'un libellé de stat : sans accent, minuscule, sans
 *  ponctuation, espaces effondrés. */
function labelKey(label: string): string {
  return (label ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Une stat "vide" : "", "0", "-", "—" — même règle que project-enrichment. */
function isEmptyStat(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = String(v).trim();
  return t === "" || t === "0" || t === "-" || t === "—";
}

/**
 * Remplit les tokens scalaires encore vides depuis la liste de stats résolue.
 * Mutation en place, fill-only. Sans correspondance de libellé connue, la stat
 * reste disponible via `__stats` (l'hydrateur `data-stats` la rendra).
 */
export function applyStatVariables(
  vars: Record<string, string>,
  stats: StatItem[] | null | undefined,
): void {
  if (!Array.isArray(stats) || stats.length === 0) return;
  for (const stat of stats) {
    if (!stat || typeof stat.label !== "string") continue;
    const token = TOKEN_BY_LABEL[labelKey(stat.label)];
    if (!token) continue;
    const value = typeof stat.value === "string" ? stat.value.trim() : "";
    if (isEmptyStat(value)) continue;
    if (vars[token] === undefined || vars[token] === "") vars[token] = value;
  }
}
