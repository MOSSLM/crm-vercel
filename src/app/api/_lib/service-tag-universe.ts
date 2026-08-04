import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeServiceTags, type ServiceTagSetting } from "@/utils/serviceTags";

/**
 * Tout ce que la base sait des service tags, en une lecture.
 *
 * Deux écrans les affichent et doivent voir la MÊME liste :
 *  - la fiche du pipeline / le site builder (`/api/site-builder/service-tags`),
 *    qui proposent les tags autorisés ;
 *  - les Paramètres (`/api/settings/enrichment-tags`), qui décident lesquels le
 *    sont.
 *
 * Tant que chacun bâtissait sa liste dans son coin, la fiche ne proposait que
 * les tags DÉJÀ posés sur une entreprise : un métier de la taxonomie qu'aucun
 * prospect ne portait encore restait introuvable dans le menu déroulant, et un
 * tag autorisé à la main dans les Paramètres n'y apparaissait jamais.
 */
export interface ServiceTagUniverse {
  /** Tags réellement portés par les entreprises et les dossiers lead magnet. */
  used: string[];
  /** Allowlist globale (`enrichment_tag_settings`) : ligne absente = autorisé. */
  settings: ServiceTagSetting[];
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * Charge l'univers des tags. Les sources secondaires (snapshots lead magnet,
 * allowlist) sont facultatives : leur échec réduit la liste, il ne doit pas
 * faire échouer l'écran qui la demande.
 *
 * Lève une erreur seulement si `entreprises` — la source principale — est
 * illisible.
 */
export async function loadServiceTagUniverse(
  supabase: SupabaseClient,
): Promise<ServiceTagUniverse> {
  const [entRes, settingsRes, lmRes] = await Promise.all([
    supabase.from("entreprises").select("service_tags, premiers_tags").not("service_tags", "is", null),
    supabase.from("enrichment_tag_settings").select("tag, allowed"),
    supabase
      .from("lead_magnet_projects")
      .select("service_tags_snapshot")
      .not("service_tags_snapshot", "is", null),
  ]);

  if (entRes.error) throw new Error(entRes.error.message);

  const used: string[] = [];
  for (const row of (entRes.data ?? []) as Array<{ service_tags?: unknown; premiers_tags?: string | null }>) {
    used.push(...normalizeServiceTags(row.service_tags, row.premiers_tags ?? null));
  }
  // Un dossier lead magnet peut porter un tag que l'entreprise n'a pas (saisi
  // sur la fiche, côté « service tags du lead magnet ») : sans lui, ce tag
  // disparaissait de la liste dès qu'on rouvrait la fiche.
  for (const row of (lmRes.data ?? []) as Array<{ service_tags_snapshot?: unknown }>) {
    used.push(...normalizeServiceTags(asStrings(row.service_tags_snapshot)));
  }

  return { used, settings: (settingsRes.data ?? []) as ServiceTagSetting[] };
}
