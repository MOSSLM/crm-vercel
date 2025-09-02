export type RevenueBand =
  | 'unknown'
  | '0-100k'
  | '100k-500k'
  | '500k-1m'
  | '1m-5m'
  | '5m-10m'
  | '10m-50m'
  | '50m+';

export type EmployeeBand =
  | 'unknown'
  | '1-10'
  | '11-50'
  | '51-200'
  | '201-500'
  | '501-1000'
  | '1000+';

export interface CompanyRaw {
  id: number;
  recherche_id: string;
  source: 'google_search' | 'google_maps';
  position?: number;
  page?: number;
  title?: string;
  meta?: string;
  url?: string;
  keyword: string;
  location: string;
  name?: string;
  avis?: number;
  nombre_avis?: number;
  tags?: string;
  adresse?: string;
  lat?: number;
  lng?: number;
  telephone?: string;
  ferme_definitivement: boolean;
  raw_json?: unknown;
  inserted_at: string;
}

export interface Company {
  id: number;
  canonical_url?: string;
  name?: string;
  adresse?: string;
  lat?: number;
  lng?: number;
  premiers_tags?: string;
  sources: string[];
  raw_ids: number[];
  qualifie: boolean;
  is_network?: boolean;
  is_blacklisted?: boolean;
  created_at: string;
  updated_at: string;
  ca_estime_band?: RevenueBand;
  nb_employes_band?: EmployeeBand;
  nb_employes_exact?: number | null;
  linkedin_url?: string;
  site_web_canonique?: string;
  manually_enriched?: boolean;
  enriched_at?: string | null;
  enriched_by?: string | null;
  recherche_id?: string;
  place_id?: string;
  reference_url?: string;
  position?: number;
  note_moyenne?: number;
  nombre_avis?: number;
  ville?: string;
  code_postal?: string;
  pays?: string;
  latitude?: number;
  longitude?: number;
  telephone?: string;
  tel?: string;
  email?: string;
  contact_name?: string;
  raw_contact_info?: CompanyRaw[];
}

export interface Contact {
  id: string;
  entreprise_id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  tel?: string;
  role_title?: string;
  linkedin_url?: string;
  is_decision_maker?: boolean;
  preferred_channel?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  companyName?: string;
  website?: string;
  address?: string;
  tags?: string[];
  source?: 'google_search' | 'google_maps';
  dateQualified?: string;
  rating?: number;
  nom?: string;
  prenom?: string;
  poste?: string;
  linkedin?: string;
}

export interface OpportunityNote {
  id: number;
  opportunite_id: string;
  theme: 'appel' | 'linkedin' | 'whatsapp' | 'email' | 'autre';
  contenu?: string;
  created_at: string;
}

export interface Opportunity {
  id: string;
  contact_id?: string;
  entreprise_id?: number;
  montant?: number;
  priorite: 'haute' | 'moyenne' | 'basse';
  stage_id?: number;
  lead_magnet: boolean;
  note_base?: string;
  tags?: string;
  date_prochain_suivi?: string;
  created_at: string;
  updated_at: string;
  name?: string;
  type?: 'one_shot' | 'mrr';
  mrr?: number;
  recurrence_months?: number;
  companyName?: string;
  companyUrl?: string;
  contactId?: string;
  stage?: string;
  value?: number;
  priority?: 'low' | 'medium' | 'high';
  notes?: string;
  createdDate?: string;
  lastUpdate?: string;
  nextFollowUp?: string;
  opportunityNotes?: OpportunityNote[];
  pipelineHistory?: unknown[];
  leadMagnet?: boolean;
  leadMagnetCreatedDate?: string;
  telephone?: string;
  email?: string;
  linkedin_url?: string;
  contact_name?: string;
}
