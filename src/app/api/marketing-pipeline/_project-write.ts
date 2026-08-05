/**
 * Écriture de la fiche sur `lead_magnet_projects`, sans qu'un chiffre
 * facultatif puisse coûter tout l'enregistrement.
 *
 * Le schéma de cette table a été posé hors des migrations du dépôt : certaines
 * bases portent un `NOT NULL DEFAULT ''` (voire un `CHECK`) sur les colonnes de
 * chiffres clés. La fiche envoie pourtant `NULL` quand la case est vide, si
 * bien qu'enregistrer une entreprise **sans qualification RGE** — le cas le
 * plus banal qui soit, `missingForSite` ne les réclame d'ailleurs pas — échouait
 * tout entier sur :
 *
 *   null value in column "stat_rge_count" of relation "lead_magnet_projects"
 *   violates not-null constraint
 *
 * `sql/20260803_stat_rge_count_optional.sql` supprime la cause en base ; ce
 * module fait que l'application ne dépend plus de cette migration.
 */

/** `true` quand la colonne n'existe pas encore (migration non appliquée). */
export const isMissingColumn = (error: WriteError | null): boolean =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));

/**
 * `true` quand Postgres refuse la VALEUR envoyée, et non la requête : classe 22
 * (données invalides — `22P02` type incompatible) et classe 23 (contraintes —
 * `23502` NOT NULL, `23514` CHECK). C'est le seul cas où réessayer autrement a
 * un sens ; une erreur de droits ou de connexion se rejouerait à l'identique.
 */
export const isValueRejected = (error: WriteError | null): boolean =>
  !!error && /^(22|23)/.test(error.code ?? "");

export type WriteError = { code?: string; message?: string };

/**
 * Chiffres clés du bloc « stats ». « Pas de chiffre » s'écrit aussi bien `NULL`
 * que `""` : toute la lecture (`hasStat` dans `_board.ts`, `isEmptyStat` /
 * `statValue` dans `project-enrichment.ts`, l'edge function d'enrichissement)
 * traite les deux exactement pareil. Repasser en `""` est donc sans effet de
 * bord quand la base refuse le `NULL`.
 */
const STAT_COLUMNS = [
  "stat_years_experience",
  "stat_satisfied_clients",
  "stat_installations_completed",
  "stat_rge_count",
  "stat_years_experience_official",
  "stat_satisfied_clients_official",
  "stat_installations_completed_official",
  "stat_rge_count_official",
] as const;

/**
 * Colonnes dont la fiche peut se passer purement et simplement. Les
 * qualifications RGE sont le seul chiffre clé facultatif : beaucoup
 * d'entreprises n'en ont aucune, le bloc « chiffres clés » se contente alors de
 * trois colonnes, et `missingForSite` ne le réclame pas. Perdre la saisie
 * complète d'une fiche pour ce chiffre-là n'a aucun sens.
 */
const DISPENSABLE_COLUMNS = [
  "stat_rge_count",
  // Les quatre colonnes « officielles » viennent d'une migration appliquée à la
  // main (20260805). Tant qu'elle n'est pas passée, la fiche doit s'enregistrer
  // sans elles plutôt que d'échouer entièrement : on ne perd que la priorité des
  // chiffres confirmés, l'estimation reste affichée.
  "stat_years_experience_official",
  "stat_satisfied_clients_official",
  "stat_installations_completed_official",
  "stat_rge_count_official",
] as const;

/** Applique un payload sur la ligne projet ; renvoie l'erreur, ou `null`. */
export type ProjectUpdate = (payload: Record<string, unknown>) => Promise<WriteError | null>;

/**
 * Enregistre la fiche, en dégradant le payload plutôt que d'échouer :
 *
 *  1. colonne absente (`override_city_source`, migration 20260727 appliquée à
 *     la main) → on enregistre sans elle ;
 *  2. chiffre clé vide refusé (`NOT NULL`) → on réécrit `""` au lieu de `NULL` ;
 *  3. toujours refusé → on abandonne les colonnes facultatives (RGE) et on
 *     enregistre tout le reste.
 *
 * Renvoie l'erreur restante, ou `null` si la fiche a été enregistrée.
 */
export async function writeProjectDetails(
  update: ProjectUpdate,
  payload: Record<string, unknown>,
): Promise<WriteError | null> {
  const next = { ...payload };
  let error = await update(next);

  if (isMissingColumn(error) && "override_city_source" in next) {
    delete next.override_city_source;
    error = await update(next);
  }

  if (isValueRejected(error)) {
    const blanked = STAT_COLUMNS.filter((col) => col in next && next[col] == null);
    if (blanked.length > 0) {
      for (const col of blanked) next[col] = "";
      error = await update(next);
    }
  }

  if (isValueRejected(error)) {
    const dispensable = DISPENSABLE_COLUMNS.filter((col) => col in next);
    if (dispensable.length > 0) {
      for (const col of dispensable) delete next[col];
      error = await update(next);
    }
  }

  return error;
}
