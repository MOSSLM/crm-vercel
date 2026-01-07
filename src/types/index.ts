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

export interface SearchResult {
  id: string;
  created_at: string;
  keyword: string;
  location: string;
  precision: string;
  source_google: boolean;
  source_maps: boolean;
  status: 'pending' | 'completed' | 'failed';
  nb_trouves: number;
  nb_qualifies: number;
  useMaps?: boolean;
  useGoogle?: boolean;
  totalCompanies?: number;
  qualifiedCompanies?: number;
  date?: string;
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
  raw_ids?: string[];
  qualifie: boolean | null;
  created_at: string;
  updated_at: string;
  ca_estime_band?: RevenueBand;
  nb_employes_band?: EmployeeBand;
  nb_employes_exact?: number | null;
  linkedin_url?: string;
  site_web_canonique?: string | null;
  manually_enriched?: boolean;
  enriched_at?: string | null;
  enriched_by?: string | null;
  reseau_id?: string | null;
  note_moyenne?: number;
  nombre_avis?: number;
  ville?: string;
  code_postal?: string;
  pays?: string;
  telephone?: string | null;
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

export interface ContactNote {
  id: number;
  contact_id: string;
  note: string;
  created_at: string;
  updated_at: string;
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

export interface CompanyNetwork {
  id: string;
  label: string;
  note?: string;
  members_count: number;
  created_at: string;
  updated_at: string;
}

export interface UrlBlacklist {
  id: string;
  scope: 'domain' | 'exact_url';
  value: string;
  reason?: string;
  active: boolean;
  created_at: string;
  created_by?: string;
}

export interface PipelineStage {
  id: number;
  nom: string;
  ordre: number;
  visible: boolean;
}

export interface Achievement {
  id: number;
  date: string;
  type_evenement?: string;
  description?: string;
  opportunite_id?: string;
  entreprise_id?: number;
  type?: 'signature' | 'deposit' | 'lead_magnet' | 'qualified' | 'meeting' | 'monthly_goal';
  title?: string;
  value?: number;
  companyName?: string;
}

export interface SupabaseObjectives {
  periode: string;
  leads_trouves?: number;
  leads_qualifies?: number;
  appels?: number;
  rdv?: number;
  devis?: number;
  relances?: number;
  signatures?: number;
  acomptes?: number;
  leadmagnets?: number;
  relances_total?: number;
  ca?: number;
}

export enum ContactChannel {
  PasDefini = 'pas_defini',
  Telephone = 'telephone',
  Email = 'email',
  Linkedin = 'linkedin',
  Whatsapp = 'whatsapp',
  Sms = 'sms',
  Autre = 'autre',
}

export enum ContactDirection {
  Incoming = 'incoming',
  Outgoing = 'outgoing',
}

export enum ContactOutcome {
  Inconnu = 'inconnu',
  Positif = 'positif',
  Negatif = 'negatif',
}

export interface Objectives {
  periode: string;
  leadsFound: number;
  leadsQualified: number;
  calls: number;
  meetings: number;
  quotes: number;
  signatures: number;
  deposits: number;
  leadMagnets: number;
  relances: number;
  revenue: number;
}
