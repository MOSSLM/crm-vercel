// =====================================================================
// Types partagés
// =====================================================================

// Taxonomie fixe des services.
//
// DOIT rester identique à `SERVICE_TAGS_TAXONOMY` de `src/utils/serviceTags.ts`
// (Deno ne peut pas importer le module du CRM, d'où la copie). Les deux listes
// sont calées sur les `data-service-tag` du template de site : un tag absent du
// template ne correspond à aucune page, et l'enrichissement masquerait alors la
// page même qu'il croit remplir. C'est arrivé avec « rénovation » (le template
// dit `renovation-generale`) et avec `bornes-irve`, absent d'ici.
export const SERVICE_TAGS_TAXONOMY = [
  "climatisation",
  "pompe à chaleur",
  "chauffage",
  "ventilation",
  "plomberie",
  "électricité",
  "photovoltaïque",
  "rénovation générale",
  "bornes IRVE",
] as const;

export type ServiceTag = (typeof SERVICE_TAGS_TAXONOMY)[number] | string; // string = fallback si rien ne matche

/**
 * Clé canonique de comparaison d'un service_tag.
 *
 * DOIT rester identique à `serviceTagKey` de `src/utils/serviceTags.ts` (Deno ne
 * peut pas importer le module du CRM, d'où la copie).
 *
 * Un simple `trim().toLowerCase()` ne suffit pas, et s'en contenter faisait fuir
 * l'allowlist : bloquer « Bornes IRVE » dans les Paramètres enregistrait la clé
 * « bornes irve », que « bornes-irve » renvoyé par le LLM ne heurtait pas — le
 * tag interdit était donc écrit quand même, alors que l'écran des Paramètres
 * l'affichait bien comme bloqué. Les accents posaient le même piège :
 * « renovation generale » passait à travers un blocage sur « rénovation
 * générale ». Les deux côtés doivent effondrer accents ET séparateurs.
 */
export const serviceTagKey = (value: string): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Configuration du modèle LLM, lue depuis la table `enrichment_llm_settings`
// (gérée depuis les Paramètres du CRM) avec repli sur les variables d'env.
export type LlmProvider = "openai" | "deepseek";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
}

/**
 * Consommation d'un appel LLM, remontée jusqu'à l'écriture pour être stockée sur
 * le projet.
 *
 * Sans elle, aucun coût n'était attribuable : `usage` n'était lu que pour
 * diagnostiquer une réponse vide, alors que des milliers de fiches sont enrichies.
 */
export interface LlmUsage {
  provider: LlmProvider;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
}

/** Résultat d'un appel LLM : l'extraction si elle a abouti, et son coût. */
export interface LlmAttempt {
  extraction: LLMExtraction | null;
  /** Statut HTTP, `0` sur erreur réseau ou expiration. Décide du retry. */
  status: number;
  usage: LlmUsage | null;
}

export interface EnrichRequest {
  project_id?: string;
  project_ids?: string[];
  /**
   * Cibles de `refresh_google_stats`, qui travaille sur l'ENTREPRISE et non sur
   * un projet : les fiches à rattraper n'ont, pour la plupart, aucun projet lead
   * magnet (132 concernées, zéro projet), donc `project_ids` ne les atteindrait
   * pas.
   */
  entreprise_ids?: number[];
  /**
   * Par défaut : enrichissement complet (scraping + Google + LLM).
   *
   * `recompute_ville_seo` ne rejoue QUE le calcul de la ville SEO — aucun appel
   * externe, aucun coût — pour rattraper les projets remplis par une version
   * antérieure de la règle.
   *
   * `refresh_google_stats` ne va chercher QUE la note et le nombre d'avis sur la
   * fiche Google : un appel Places, ni scraping ni LLM. Aucune IA n'entre en jeu,
   * ce sont deux champs d'API (`rating`, `userRatingCount`).
   */
  action?: "enrich" | "recompute_ville_seo" | "refresh_google_stats";
}

export interface EnrichResult {
  project_id: string;
  status: "success" | "failed" | "skipped" | "no_website";
  error?: string;
  updated_fields?: string[];
}

export interface EnrichResponse {
  results: EnrichResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    no_website: number;
  };
  /** `false` quand le budget de temps a interrompu le lot avant la fin. */
  done: boolean;
  /**
   * Projets non traités faute de temps. L'appelant les renvoie tels quels pour
   * continuer — c'est ce qui remplace l'expiration muette qui laissait des projets
   * verrouillés en `processing`.
   */
  remaining_project_ids: string[];
  elapsed_ms: number;
}

// Snapshot des données d'entrée récupérées de Supabase
export interface ProjectContext {
  project_id: string;
  opportunite_id: string;
  entreprise_id: number;
  // lead_magnet_projects fields (existants, à ne pas écraser si déjà remplis)
  lmp: {
    logo_url: string | null;
    override_entreprise_name: string | null;
    override_city: string | null;
    override_email: string | null;
    override_address: string | null;
    override_location: string | null;
    stat_years_experience: string | null;
    stat_satisfied_clients: string | null;
    stat_installations_completed: string | null;
    stat_rge_count: string | null;
    service_tags_snapshot: string[];
    variables: Record<string, unknown>;
  };
  // entreprises fields
  entreprise: {
    name: string | null;
    adresse: string | null;
    ville: string | null;
    code_postal: string | null;
    site_web_canonique: string | null;
    canonical_url: string | null;
    google_url: string | null;
    google_maps_url: string | null;
    google_place_id: string | null;
    nombre_avis: number | null;
    note_moyenne: number | null;
    service_tags: string[];
    logo_url: string | null;
    google_reviews_5star: unknown[] | null; // jsonb array, format variable
  };
  // opportunites
  opportunite: {
    lead_magnet: boolean;
    pipeline_id: string | null;
    stage_id: number | null;
  };
  // reviews déjà présentes pour ce LM project (pour ne pas les écraser)
  existing_reviews_count: number;
}

// Sortie de l'extraction LLM (JSON structuré)
export interface LLMExtraction {
  // Services — doivent venir de la taxonomie fixe sauf cas exceptionnel
  services_tags: string[];
  // Infos entreprise extraites du site
  company_name_clean: string | null; // nom nettoyé si le nom Google contient des extras
  email: string | null;
  logo_url: string | null; // URL absolue depuis le site
  address_clean: string | null; // si adresse actuelle invalide (ex: "4(9)")
  // Stats
  years_experience: number | null; // si trouvé sur site/about
  rge_count: number | null; // nb total de qualifications (pas que RGE)
  satisfied_clients_from_site: number | null; // si une stat client est affichée
  installations_from_site: number | null; // si une stat installations est affichée
  // Géographie (déduite de l'adresse)
  closest_big_city: string | null; // grande ville la plus proche dans 30-50km
  surrounding_cities: string[]; // 8-12 villes connues dans 30-50km
  // Site accessible ?
  site_accessible: boolean;
  site_accessible_reason?: string; // si false, pourquoi
}

// Review Google Places
export interface GoogleReview {
  author_name: string;
  text: string;
  rating: number;
  time?: number;
}

// Résultat Google Places
export interface GooglePlaceData {
  formatted_address: string | null;
  /** `userRatingCount` — nombre total d'avis Google. */
  total_reviews: number | null;
  /** `rating` — note moyenne Google, source de `entreprises.note_moyenne`. */
  rating: number | null;
  reviews_5star: GoogleReview[];
  name: string | null;
  /** Coordonnées du lieu — source la plus précise pour calculer la ville SEO. */
  lat: number | null;
  lng: number | null;
}