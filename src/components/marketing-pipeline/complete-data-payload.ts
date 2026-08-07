/**
 * Ce que la grille de complétion envoie : les champs MODIFIÉS, et eux seuls.
 *
 * Séparé du rendu parce que c'est là qu'est le risque. La grille n'affiche que
 * les champs requis ; si un champ non saisi partait quand même dans le payload,
 * il arriverait vide côté serveur et effacerait ce que la fiche portait. La
 * règle tenue ici, en écho à `_missing-data.ts` : **une clé absente n'est pas
 * une clé à vider**.
 */

import { toArr, type RequiredField, type RequiredValues } from "./required-fields";

export interface EditedRow {
  /** Valeurs en cours de saisie. */
  values: RequiredValues;
  /** Dernières valeurs enregistrées — la référence de comparaison. */
  initial: RequiredValues;
}

/** Champs dont la valeur diffère de la dernière version enregistrée. */
export function changedFields(row: EditedRow): RequiredField[] {
  return (Object.keys(row.values) as Array<keyof RequiredValues>).filter(
    (k) => row.values[k] !== row.initial[k],
  );
}

export interface RowPayload {
  company?: Record<string, unknown>;
  project?: Record<string, unknown>;
}

/**
 * Les deux patchs partiels d'une ligne, ou `null` si rien n'a bougé.
 *
 * La traduction vers les noms de colonnes se fait ici : le formulaire parle de
 * `lm_stat_years`, la base de `stat_years_experience`. Les champs vivant sur
 * `lead_magnet_projects` (ville SEO, logo, chiffres clés) partent dans
 * `project`, les autres dans `company` — même partage que la fiche.
 */
export function payloadFor(row: EditedRow): RowPayload | null {
  const changed = new Set(changedFields(row));
  if (changed.size === 0) return null;

  const company: Record<string, unknown> = {};
  if (changed.has("name")) company.name = row.values.name;
  if (changed.has("ville")) company.ville = row.values.ville;
  if (changed.has("code_postal")) company.code_postal = row.values.code_postal;
  if (changed.has("telephone")) company.telephone = row.values.telephone;
  if (changed.has("service_tags")) company.service_tags = toArr(row.values.service_tags);
  if (changed.has("note_moyenne")) {
    // Une note effacée vaut `null`, pas `0` : `Number("")` rend 0, et le site
    // afficherait une note de zéro là où il n'y en a simplement pas.
    const n = Number(row.values.note_moyenne);
    company.note_moyenne = row.values.note_moyenne.trim() === "" || Number.isNaN(n) ? null : n;
  }

  const project: Record<string, unknown> = {};
  if (changed.has("lm_override_city")) project.override_city = row.values.lm_override_city;
  if (changed.has("lm_logo_url")) project.logo_url = row.values.lm_logo_url;
  if (changed.has("lm_stat_years")) project.stat_years_experience = row.values.lm_stat_years;
  if (changed.has("lm_stat_clients")) project.stat_satisfied_clients = row.values.lm_stat_clients;
  if (changed.has("lm_stat_installations")) {
    project.stat_installations_completed = row.values.lm_stat_installations;
  }

  // Un objet vide dirait au serveur « il y a un patch » et lui ferait chercher
  // (voire créer) un dossier lead magnet pour n'y rien écrire.
  const payload: RowPayload = {};
  if (Object.keys(company).length > 0) payload.company = company;
  if (Object.keys(project).length > 0) payload.project = project;
  return Object.keys(payload).length > 0 ? payload : null;
}
