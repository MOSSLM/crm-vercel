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

/** Une ligne de `service_tag_usage()` : un libellé brut et ses porteurs. */
type LigneUsage = {
  source: "entreprises" | "lead_magnets" | "media";
  tag: string;
  n: number;
};

/**
 * Charge l'univers des tags. Les sources secondaires (snapshots lead magnet,
 * allowlist) sont facultatives : leur échec réduit la liste, il ne doit pas
 * faire échouer l'écran qui la demande.
 *
 * Cette fonction lisait les 60 944 lignes de `entreprises` — 8,3 Mo de
 * `service_tags` — à chaque ouverture de Réglages › Tags et du catalogue du
 * site builder, puis comptait en JS. Or il n'existe que ~280 libellés
 * distincts : c'est cet ordre de grandeur qui transite désormais, l'agrégation
 * étant faite par la RPC `service_tag_usage()`.
 *
 * La RPC renvoie UN tableau jsonb, pas des lignes : PostgREST plafonne le
 * nombre de lignes d'une réponse (« Max rows », 1000 par défaut chez Supabase),
 * et un dépassement serait silencieux sur un écran qui pilote des fusions
 * destructives.
 *
 * La normalisation reste ici, et nulle part ailleurs : la base renvoie des
 * libellés BRUTS, `serviceTagKey` les regroupe, `normalizeServiceTags` applique
 * la taxonomie et les exclusions. Dupliquer ces règles en SQL aurait créé une
 * seconde source de vérité qui aurait dérivé.
 */
export async function loadServiceTagUniverse(
  supabase: SupabaseClient,
): Promise<ServiceTagUniverse> {
  const [usageRes, settingsRes] = await Promise.all([
    supabase.rpc("service_tag_usage_json"),
    supabase.from("enrichment_tag_settings").select("tag, allowed, demarchable"),
  ]);

  if (usageRes.error) throw new Error(usageRes.error.message);

  const used: string[] = [];
  const usage: ServiceTagUsage = { entreprises: {}, leadMagnets: {}, media: {} };

  const seau = (source: LigneUsage["source"]): Record<string, number> =>
    source === "entreprises"
      ? usage.entreprises
      : source === "lead_magnets"
        ? usage.leadMagnets
        : usage.media;

  const lignes: LigneUsage[] = Array.isArray(usageRes.data) ? usageRes.data : [];
  for (const ligne of lignes) {
    // `all` est le marqueur d'image universelle (cf. `media_library`), pas un
    // service : il ne doit jamais apparaître dans un décompte de fusion.
    if (ligne.source === "media" && ligne.tag === "all") continue;

    // `normalizeServiceTags` sur un libellé seul applique la taxonomie : un tag
    // exclu ressort vide et disparaît des deux côtés, comme avant.
    const retenus = ligne.source === "media" ? [ligne.tag] : normalizeServiceTags([ligne.tag]);
    if (retenus.length === 0) continue;

    // La médiathèque n'alimente PAS `used` : un tag qui ne vit plus que sur une
    // image n'est pas un service proposé, et le faire remonter dans le catalogue
    // le rendrait sélectionnable sur une fiche. Il est seulement compté, pour
    // que la fusion annonce les médias qu'elle va toucher.
    if (ligne.source !== "media") used.push(...retenus);

    // Un porteur compte une fois par clé. Deux graphies d'une même clé portées
    // par la MÊME entreprise gonfleraient ce total d'une unité — cas vérifié
    // absent en base (0 porteur concerné), et qui ne fausserait que l'aperçu
    // « lignes touchées » affiché avant une fusion.
    const bucket = seau(ligne.source);
    for (const key of serviceTagKeySet(retenus)) {
      bucket[key] = (bucket[key] ?? 0) + Number(ligne.n ?? 0);
    }
  }

  return { used, settings: (settingsRes.data ?? []) as ServiceTagSetting[], usage };
}
