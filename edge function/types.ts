// =====================================================================
// Types partagés
// =====================================================================

// Taxonomie fixe des services (selon la spec du projet)
export const SERVICE_TAGS_TAXONOMY = [
  "climatisation",
  "pompe à chaleur",
  "chauffage",
  "ventilation",
  "plomberie",
  "électricité",
  "photovoltaïque",
  "rénovation",
] as const;

export type ServiceTag = (typeof SERVICE_TAGS_TAXONOMY)[number] | string; // string = fallback si rien ne matche

export interface EnrichRequest {
  project_id?: string;
  project_ids?: string[];
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
  total_reviews: number | null;
  reviews_5star: GoogleReview[];
  name: string | null;
}
