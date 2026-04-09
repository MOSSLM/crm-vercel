import type { CSSProperties } from 'react';

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
  service_tags?: string[];
  sources: string[];
  raw_ids?: string[];
  qualifie: boolean;
  hidden_in_qualification?: boolean;
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
  logo_url?: string | null;
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
  pipeline_id?: string;
  offre_id?: string;
  offre_prix_ht_snapshot?: number;
  offre_devise_snapshot?: string;
  montant?: number;
  priorite: 'haute' | 'moyenne' | 'basse';
  stage_id?: number;
  lead_magnet: boolean;
  note_base?: string;
  tags?: string;
  flags?: string[];
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
  offre_nom_snapshot?: string;
}

export interface OfferIncludedItem {
  id: string;
  parent_offre_id: string;
  included_offre_id: string;
  quantite: number;
  is_optional: boolean;
  sort_order: number;
  notes?: string;
  discount_type?: 'percent' | 'fixed';
  discount_value?: number;
  nom?: string;
  type?: 'service' | 'package';
}

export interface Offer {
  id: string;
  type: 'service' | 'package';
  code?: string;
  nom: string;
  description?: string;
  prix_ht?: number;
  devise: string;
  billing_period?: string;
  actif: boolean;
  visible_in_qualification: boolean;
  qualification_order: number;
  slug?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  package_discount_type?: 'percent' | 'fixed';
  package_discount_value?: number;
  created_at: string;
  updated_at: string;
  included_items: OfferIncludedItem[];
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
  pipeline_id: string;
  nom: string;
  ordre: number;
  visible: boolean;
}

export interface Pipeline {
  id: string;
  nom: string;
  ordre: number;
  visible: boolean;
  is_default: boolean;
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

// ─── Site Builder ────────────────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  description?: string;
  published: boolean;
  sub_domain_name?: string;
  created_at: string;
  updated_at: string;
}

export interface SitePage {
  id: string;
  site_id: string;
  name: string;
  path_name: string;
  content: string;
  order: number;
  visits: number;
  preview_image?: string;
  created_at: string;
  updated_at: string;
}

// Editor types (ported from lpura)
export type DeviceTypes = 'Desktop' | 'Mobile' | 'Tablet';

export type EditorBtns =
  | 'text'
  | 'container'
  | 'section'
  | 'link'
  | '2Col'
  | 'video'
  | '__body'
  | 'image'
  | '3Col'
  | 'savedComponent'
  | null;

export type EditorElement = {
  id: string;
  styles: CSSProperties;
  name: string;
  type: EditorBtns;
  content:
    | EditorElement[]
    | {
        href?: string;
        innerText?: string;
        src?: string;
        alt?: string;
      };
};

export type Editor = {
  pageId: string;
  liveMode: boolean;
  elements: EditorElement[];
  selectedElement: EditorElement;
  device: DeviceTypes;
  previewMode: boolean;
};

export type HistoryState = {
  currentIndex: number;
  history: Editor[];
};

export type EditorState = {
  editor: Editor;
  history: HistoryState;
};

export type EditorAction =
  | { type: 'ADD_ELEMENT'; payload: { containerId: string; elementDetails: EditorElement } }
  | { type: 'UPDATE_ELEMENT'; payload: { elementDetails: EditorElement } }
  | { type: 'DELETE_ELEMENT'; payload: { elementDetails: EditorElement } }
  | {
      type: 'CHANGE_CLICKED_ELEMENT';
      payload: { elementDetails?: EditorElement | { id: ''; content: []; name: ''; styles: Record<string, never>; type: null } };
    }
  | { type: 'CHANGE_DEVICE'; payload: { device: DeviceTypes } }
  | { type: 'TOGGLE_PREVIEW_MODE' }
  | { type: 'TOGGLE_LIVE_MODE'; payload?: { value: boolean } }
  | { type: 'REDO' }
  | { type: 'UNDO' }
  | { type: 'LOAD_DATA'; payload: { elements: EditorElement[]; withLive: boolean } }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_PAGE_ID'; payload: { pageId: string } };

// Reusable saved components
export interface SavedComponent {
  id: string;
  name: string;
  category: string;
  content: string; // JSON string of EditorElement
  created_at: string;
  updated_at: string;
}
