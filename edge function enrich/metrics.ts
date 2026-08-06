// =====================================================================
// Journal des runs d'enrichissement (table `enrichment_runs`)
// =====================================================================
// POURQUOI
// Jusqu'ici, un run ne laissait que trois colonnes sur le projet
// (`enrichment_model` + les deux compteurs de tokens), écrites uniquement en cas
// de SUCCÈS et écrasées au run suivant. Les échecs n'avaient donc jamais de
// modèle, un projet réenrichi perdait la trace du run précédent, et tout le
// reste — site atteint ou non, pages scrapées, Google touché ou non, champs
// trouvés vs laissés à null, durées — partait dans `console.log` et disparaissait
// avec les logs de la plateforme.
//
// Ici, une ligne par projet et par passage, y compris les runs ignorés et
// échoués : c'est ce qui permet de mesurer la qualité de la fonction et de
// comparer les modèles autrement qu'à l'estime.
//
// RÈGLE ABSOLUE : le journal ne doit JAMAIS faire échouer un enrichissement.
// L'insert est best-effort et l'absence de la table (migration non appliquée)
// est tolérée — même posture que `OPTIONAL_PROJECT_COLUMNS` dans `db.ts`.
// =====================================================================

import type { LLMExtraction } from "./types.ts";

/**
 * Le strict nécessaire du client Supabase — un insert.
 *
 * Décrit structurellement plutôt qu'importé de `esm.sh` : ce module est couvert
 * par les tests Jest du CRM, qui ne savent pas résoudre une URL distante. Les
 * autres modules de l'edge function importent le vrai client, eux ne sont pas
 * testés ici.
 */
interface InsertClient {
  from(table: string): {
    insert(values: unknown): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Miroir des colonnes de `enrichment_runs`. Tout est optionnel : un run
 * interrompu tôt (lock non pris, projet introuvable) n'a presque rien à dire, et
 * doit malgré tout laisser sa ligne.
 */
export interface RunRecord {
  project_id: string;
  entreprise_id?: number | null;
  opportunite_id?: string | null;
  source: string;

  status?: string;
  outcome_reason?: string | null;
  error_message?: string | null;
  duration_ms?: number;

  site_url_input?: string | null;
  site_url_final?: string | null;
  site_url_corrected?: boolean;
  site_reached?: boolean;
  scrape_error?: string | null;
  scrape_pages?: number;
  scrape_paths?: string[];
  scrape_chars?: number;
  scrape_ms?: number;
  scrape_via?: string | null;
  jina_rate_limited?: boolean;

  google_attempted?: boolean;
  google_place_id_source?: string | null;
  google_ok?: boolean;
  google_rating?: number | null;
  google_reviews_total?: number | null;
  google_reviews_inserted?: number;
  google_ms?: number;

  llm_provider?: string | null;
  llm_model?: string | null;
  llm_attempts?: number;
  llm_last_status?: number;
  llm_tokens_prompt?: number | null;
  llm_tokens_completion?: number | null;
  llm_tokens_reasoning?: number | null;
  llm_ms?: number;

  fields_found?: Record<string, boolean>;
  fields_found_count?: number;
  fields_total?: number;
  fields_written?: string[];
  service_tags_count?: number;
  ville_seo_source?: string | null;
}

/** Sources reconnues, pour mémoire — la colonne reste libre. */
export type RunSource = "db_trigger" | "crm_manual" | "reenrich" | "agent" | "unknown";

/**
 * Champs dont on suit le taux de remplissage.
 *
 * C'est la mesure de qualité d'un modèle : ce qu'il a TROUVÉ sur le site,
 * indépendamment de ce qui a fini écrit en base. L'application est volontairement
 * non destructive (un champ déjà rempli sur la fiche n'est jamais réécrit), donc
 * `fields_written` mesure l'apport marginal, pas la performance du modèle.
 */
export const TRACKED_FIELDS = [
  "services_tags",
  "company_name_clean",
  "email",
  "logo_url",
  "address_clean",
  "years_experience",
  "rge_count",
  "satisfied_clients_from_site",
  "installations_from_site",
  "closest_big_city",
  "surrounding_cities",
] as const;

/** Un run neuf, avant toute étape. */
export function newRun(projectId: string, source: string): RunRecord {
  return { project_id: projectId, source: source || "unknown" };
}

/**
 * `{champ: trouvé ?}` pour les onze champs suivis.
 *
 * Un tableau vide compte comme NON trouvé : `services_tags: []` veut dire que le
 * modèle n'a identifié aucun service, pas qu'il a répondu. Les compter comme
 * trouvés gonflerait le taux de tous les modèles à l'identique et masquerait
 * précisément ce qu'on cherche à comparer.
 */
export function fieldsFound(extraction: LLMExtraction | null): {
  fields_found: Record<string, boolean>;
  fields_found_count: number;
  fields_total: number;
} {
  const found: Record<string, boolean> = {};
  for (const key of TRACKED_FIELDS) {
    const value = extraction ? (extraction as unknown as Record<string, unknown>)[key] : null;
    found[key] = Array.isArray(value)
      ? value.length > 0
      : value !== null && value !== undefined && value !== "";
  }
  const count = Object.values(found).filter(Boolean).length;
  return { fields_found: found, fields_found_count: count, fields_total: TRACKED_FIELDS.length };
}

/**
 * Écrit la ligne de journal. Best-effort : toute erreur est signalée puis
 * ignorée — mieux vaut perdre une mesure qu'un enrichissement.
 */
export async function saveRun(sb: InsertClient, run: RunRecord): Promise<void> {
  try {
    const { error } = await sb.from("enrichment_runs").insert(run);
    if (error) {
      console.warn(`[${run.project_id}] journal du run non écrit : ${error.message}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[${run.project_id}] journal du run non écrit : ${msg}`);
  }
}
