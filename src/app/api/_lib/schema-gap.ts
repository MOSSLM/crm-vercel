/**
 * Détection des « trous de schéma » : une migration écrite dans `sql/` mais pas
 * encore jouée sur la base.
 *
 * Sans ça, une colonne manquante remonte en 500 opaque et l'interface affiche
 * « Enregistrement impossible » — l'utilisateur croit à un bug du code alors
 * qu'il lui manque un `alter table`. On préfère nommer le fichier SQL à jouer.
 */

export type PgLikeError = { code?: string; message?: string } | null | undefined;

/** `true` quand la table n'existe pas encore (migration non appliquée). */
export const isMissingTable = (error: PgLikeError): boolean => {
  if (!error) return false;
  // 42P01 = undefined_table (Postgres), PGRST205 = table absente du cache PostgREST.
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|relation .* does not exist/i.test(error.message ?? "")
  );
};

/** `true` quand la colonne visée n'existe pas encore sur une table qui, elle, existe. */
export const isMissingColumn = (error: PgLikeError): boolean => {
  if (!error) return false;
  // 42703 = undefined_column (Postgres), PGRST204 = colonne absente du cache PostgREST.
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /could not find the '.*' column|column .* does not exist/i.test(error.message ?? "")
  );
};

/** `true` si l'erreur vient d'une migration manquante, table ou colonne. */
export const isSchemaGap = (error: PgLikeError): boolean => isMissingTable(error) || isMissingColumn(error);

/**
 * Message d'erreur prêt à afficher : ce qu'il manque, et le fichier à jouer
 * dans l'éditeur SQL de Supabase.
 */
export const migrationMessage = (file: string, what: string): string =>
  `${what} — la migration n’est pas appliquée sur cette base. Jouez ${file} dans l’éditeur SQL Supabase, puis réessayez.`;
