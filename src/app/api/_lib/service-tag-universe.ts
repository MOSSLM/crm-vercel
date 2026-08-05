import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeServiceTags, serviceTagKeySet, type ServiceTagSetting } from "@/utils/serviceTags";

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
  /**
   * Nombre de porteurs par clé canonique et par table.
   *
   * Séparé par table à dessein : `used` mélange les deux, mais fusionner un tag
   * ne se joue pas au même endroit selon la table. Le snapshot du dossier lead
   * magnet ÉCRASE `entreprises.service_tags` au rendu
   * (`resolve-variables.ts`, `projectServiceTags ?? serviceTags`), donc corriger
   * la fiche sans corriger le snapshot ne change rien au site affiché. L'écran
   * de fusion doit pouvoir le montrer avant qu'on applique.
   */
  usage: ServiceTagUsage;
}

/** Compteurs par clé canonique (`serviceTagKey`), une entrée par table. */
export interface ServiceTagUsage {
  entreprises: Record<string, number>;
  leadMagnets: Record<string, number>;
  media: Record<string, number>;
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
  const [entRes, settingsRes, lmRes, mediaRes] = await Promise.all([
    supabase.from("entreprises").select("service_tags, premiers_tags").not("service_tags", "is", null),
    supabase.from("enrichment_tag_settings").select("tag, allowed"),
    supabase
      .from("lead_magnet_projects")
      .select("service_tags_snapshot")
      .not("service_tags_snapshot", "is", null),
    // La médiathèque porte les mêmes tags pour choisir ses images ; une fusion
    // qui l'oublierait casserait l'auto-image du service renommé.
    supabase.from("media_library").select("service_tags").not("service_tags", "is", null),
  ]);

  if (entRes.error) throw new Error(entRes.error.message);

  const used: string[] = [];
  const usage: ServiceTagUsage = { entreprises: {}, leadMagnets: {}, media: {} };

  // Un porteur compte une fois par tag, même s'il le liste deux fois sous deux
  // graphies : le décompte annoncé avant la fusion doit être un nombre de
  // lignes à modifier, pas un nombre d'occurrences.
  const tally = (bucket: Record<string, number>, tags: readonly string[]): void => {
    for (const key of serviceTagKeySet(tags)) bucket[key] = (bucket[key] ?? 0) + 1;
  };

  for (const row of (entRes.data ?? []) as Array<{ service_tags?: unknown; premiers_tags?: string | null }>) {
    const tags = normalizeServiceTags(row.service_tags, row.premiers_tags ?? null);
    used.push(...tags);
    tally(usage.entreprises, tags);
  }
  // Un dossier lead magnet peut porter un tag que l'entreprise n'a pas (saisi
  // sur la fiche, côté « service tags du lead magnet ») : sans lui, ce tag
  // disparaissait de la liste dès qu'on rouvrait la fiche.
  for (const row of (lmRes.data ?? []) as Array<{ service_tags_snapshot?: unknown }>) {
    const tags = normalizeServiceTags(asStrings(row.service_tags_snapshot));
    used.push(...tags);
    tally(usage.leadMagnets, tags);
  }
  // La médiathèque n'alimente PAS `used` : un tag qui ne vit plus que sur une
  // image n'est pas un service proposé, et le faire remonter dans le catalogue
  // le rendrait sélectionnable sur une fiche. Il est seulement compté, pour que
  // la fusion annonce les médias qu'elle va toucher.
  for (const row of (mediaRes.data ?? []) as Array<{ service_tags?: unknown }>) {
    // `all` est le marqueur d'image universelle (cf. `media_library`), pas un
    // service : il ne doit jamais apparaître dans un décompte de fusion.
    tally(usage.media, asStrings(row.service_tags).filter((t) => t !== "all"));
  }

  return { used, settings: (settingsRes.data ?? []) as ServiceTagSetting[], usage };
}
