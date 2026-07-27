import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remise à zéro d'un projet lead magnet avant (ré)enrichissement.
 *
 * Partagé par `enrich-prepare` (préparation d'une sélection depuis le board) et
 * `reenrich` (rattrapage en masse des anciens enrichissements) : les deux
 * doivent poser exactement le même état, sinon un ré-enrichissement en masse ne
 * repart pas de la même base qu'un clic sur une carte.
 */

/** Statuts que l'edge function refuse de re-traiter (cf. `shouldProcess`) : un
 *  ré-enrichissement doit d'abord les repasser à `draft`, sinon le run est
 *  silencieusement ignoré. Ce sont aussi les statuts qui signent un
 *  enrichissement déjà fait (cf. `isEnrichmentDone` dans `_board.ts`). */
export const TERMINAL_STATUSES = ["framer", "ready", "published"] as const;

const TERMINAL_SET = new Set<string>(TERMINAL_STATUSES);

/** Columns the edge function fills during enrichment. Cleared on `overwrite`
 *  so the next run repopulates them from a clean slate. Manual reviews and the
 *  `entreprises` row are intentionally left untouched. */
export const OVERWRITE_CLEARED_COLUMNS = {
  override_entreprise_name: null,
  override_email: null,
  override_address: null,
  // Ville SEO (`override_city`) + son miroir historique : sans ce reset, un
  // ré-enrichissement « overwrite » conserverait une ville SEO devenue fausse.
  override_city: null,
  override_location: null,
  logo_url: null,
  stat_years_experience: null,
  stat_satisfied_clients: null,
  stat_installations_completed: null,
  stat_rge_count: null,
  service_tags_snapshot: [] as string[],
};

/** Drops the enrichment-derived "villes autour" keys from a project's jsonb. */
export function stripSurroundingCities(
  variables: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const vars = { ...(variables ?? {}) };
  delete vars.surrounding_cities;
  delete vars.surrounding_cities_text;
  return vars;
}

/**
 * Payload d'`update` remettant un projet existant en état d'être enrichi.
 *
 * `pret_pour_lm` est le verrou que l'edge function exige ; le statut ne repasse
 * à `draft` que si c'est nécessaire (déjà enrichi) ou demandé (`overwrite`), pour
 * ne pas piétiner un run en cours. `enrichment_error` est remis à zéro par le
 * lock de l'edge function.
 */
export function enrichResetPayload(opts: {
  statut: string | null;
  variables?: Record<string, unknown> | null;
  overwrite: boolean;
  now: string;
}): Record<string, unknown> {
  const { statut, variables, overwrite, now } = opts;
  const payload: Record<string, unknown> = { pret_pour_lm: true, updated_at: now };
  if (overwrite || TERMINAL_SET.has(statut ?? "")) payload.statut = "draft";
  if (overwrite) {
    Object.assign(payload, OVERWRITE_CLEARED_COLUMNS);
    payload.variables = stripSurroundingCities(variables);
    // La ville SEO repart du calcul : on efface aussi la provenance, sinon un
    // projet marqué `auto` garderait une trace qui ne correspond plus à rien.
    payload.override_city_source = null;
  }
  return payload;
}

/** `true` quand la colonne n'existe pas encore (migration non appliquée). */
export const isMissingColumn = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));

/**
 * Applique un payload de reset en tolérant l'absence de `override_city_source`
 * (migration 20260727 appliquée à la main, comme le fait déjà l'edge function).
 * Sans ce repli, une base non migrée ferait échouer toute la remise à zéro pour
 * une colonne dont on ne perd que la trace de provenance.
 *
 * Retourne le message d'erreur, ou null si l'écriture a réussi.
 */
export async function applyEnrichReset(
  supabase: SupabaseClient,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await supabase.from("lead_magnet_projects").update(payload).eq("id", projectId);
  if (!error) return null;
  if (!isMissingColumn(error) || !("override_city_source" in payload)) {
    return error.message ?? "reset échoué";
  }
  const { override_city_source: _dropped, ...rest } = payload;
  const retry = await supabase.from("lead_magnet_projects").update(rest).eq("id", projectId);
  return retry.error ? (retry.error.message ?? "reset échoué") : null;
}
