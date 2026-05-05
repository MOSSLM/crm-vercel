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
  email?: string | null;
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
  | 'canvasElement'
  | 'customCode'
  | null;

export interface CustomCodeContent {
  code: string;
  schema: string; // JSON: { varName: { type: 'string'|'color'|'number'|'boolean', label: string, default: string } }
  propValues: Record<string, string>;
}

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
      }
    | CustomCodeContent;
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
  | { type: 'SET_PAGE_ID'; payload: { pageId: string } }
  | {
      type: 'MOVE_ELEMENT';
      payload: {
        elementId: string;
        targetContainerId: string;
        position?: 'inside' | 'before' | 'after';
      };
    };

// Reusable saved components
export interface SavedComponent {
  id: string;
  name: string;
  category: string;
  content: string; // JSON string of EditorElement
  created_at: string;
  updated_at: string;
}

// ── AUDIT SYSTEM ──────────────────────────────────────────

export interface AuditAdditionalService {
  label: string;
  description?: string;
  amount: number;
  is_mrr: boolean;
  badge?: string;
}

export interface AuditProblem {
  title: string;
  desc: string;
}

export interface AuditSolution {
  num: string;
  name: string;
  desc: string;
  tag: string;
}

export interface AuditLivrable {
  title: string;
  items: string[];
}

export interface AuditPlanningStep {
  week: string;
  title: string;
  desc: string;
}

export interface AuditNextStep {
  title: string;
  desc: string;
}

export interface AuditPricingService {
  label: string;
  sub_label?: string;
  amount: number;
  is_mrr: boolean;
  enabled: boolean;
}

export interface AuditGlobalStyle {
  grain_opacity?: number;        // default 0.045
  grain_base_frequency?: number; // default 0.75 (higher = finer grain)
  grain_color?: string;          // default '#ffffff'
  font_cover_title?: number;     // default 56
  font_section_title?: number;   // default 38
  font_section_intro?: number;   // default 14
}

export interface AuditPage1 {
  date: string;
  eyebrow: string;
  title_line1: string;
  title_line2: string;
  title_line3: string;
  subtitle: string;
  client_name: string;
  client_meta: string;
  demo_url: string;
}

export interface AuditPage2 {
  header_section?: string;
  section_label?: string;
  section_title?: string;
  section_title_em?: string;
  section_intro: string;
  problems: AuditProblem[];
  quote: string;
  quote_source: string;
}

export interface AuditPage3 {
  header_section?: string;
  section_label?: string;
  section_title?: string;
  section_title_em?: string;
  section_intro: string;
  solutions: AuditSolution[];
}

export interface AuditPage4 {
  header_section?: string;
  section_label?: string;
  section_title?: string;
  section_title_em?: string;
  section_subtitle?: string;
  livrables: AuditLivrable[];
}

export interface AuditPage5 {
  header_section?: string;
  section_label?: string;
  // Planning steps kept for backward compat (no longer rendered on page 5)
  planning_steps: AuditPlanningStep[];
  // Main pricing card
  services?: AuditPricingService[];
  pricing_subtitle?: string;
  show_grain?: boolean;
  flatten_grain_for_pdf?: boolean;
  price_note: string;
  // Additional optional services (mini cards)
  additional_services?: AuditAdditionalService[];
  addl_section_title?: string;
  addl_section_subtitle?: string;
  // Legacy fields kept for backward compatibility
  price_setup?: string;
  price_setup_label?: string;
  price_setup_desc?: string;
  price_monthly?: string;
  price_monthly_label?: string;
  price_monthly_desc?: string;
  price_total?: string;
  price_total_label?: string;
}

export interface AuditPage6 {
  header_section?: string;
  section_label?: string;
  section_title?: string;
  section_title_line2?: string;
  section_title_em?: string;
  section_subtitle?: string;
  next_steps: AuditNextStep[];
  cta_title: string;
  cta_sub: string;
  contact_phone: string;
  contact_email: string;
  contact_website: string;
}

export interface AuditContent {
  page1: AuditPage1;
  page2: AuditPage2;
  page3: AuditPage3;
  page4: AuditPage4;
  page5: AuditPage5;
  page6: AuditPage6;
  global_style?: AuditGlobalStyle;
}

export interface Audit {
  id: string;
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
  content: AuditContent;
  pdf_url?: string;
  pdf_generated_at?: string;
  statut: 'draft' | 'ready';
  created_at: string;
  updated_at: string;
}

export interface AuditTemplate {
  id: string;
  nom: string;
  template_key: string;
  default_content: AuditContent;
  created_at: string;
  updated_at: string;
}

// ── WORKFLOW AUTOMATION ──────────────────────────────────────

export type WorkflowActionType = 'create_task' | 'add_note' | 'send_email' | 'update_field';

export type WorkflowTriggerType =
  | 'stage_changed'
  | 'opportunite_created'
  | 'email_sent'
  | 'offre_accepted';

export interface WorkflowAction {
  type: WorkflowActionType;
  delay_days?: number;
  params: Record<string, string>;
}

export interface CrmWorkflow {
  id: string;
  name: string;
  description?: string;
  trigger_type: WorkflowTriggerType;
  trigger_conditions: Record<string, string>;
  actions: WorkflowAction[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmWorkflowExecution {
  id: string;
  workflow_id: string;
  opportunite_id?: string;
  trigger_data?: Record<string, unknown>;
  status: 'completed' | 'failed' | 'partial';
  actions_executed?: WorkflowAction[];
  error?: string;
  executed_at: string;
}

export interface OpportuniteTask {
  id: string;
  opportunite_id: string;
  entreprise_id?: number;
  titre: string;
  description?: string;
  type: 'relance' | 'appel' | 'email' | 'rdv' | 'autre';
  statut: 'a_faire' | 'fait' | 'annule';
  due_date?: string;
  assigned_to?: string;
  workflow_id?: string;
  created_at: string;
  updated_at: string;
}

export interface OpportuniteOffre {
  id: string;
  opportunite_id: string;
  offre_id?: string;
  offre_nom: string;
  offre_prix_ht?: number;
  statut: 'proposee' | 'acceptee' | 'refusee' | 'en_cours';
  notes?: string;
  created_at: string;
  offres?: Pick<Offer, 'id' | 'nom' | 'type' | 'prix_ht' | 'devise' | 'billing_period'>;
}

// ── SITE BUILDER V2 – Theme & Config System ──────────────────────────────────

export type SectionDataSource = 'enterprise' | 'config' | 'client-editable' | 'dynamic';

export type SectionAnimation = 'none' | 'fade-in' | 'slide-up' | 'slide-in-left' | 'slide-in-right';

export interface SectionDefinition {
  type: string;
  label: string;
  description?: string;
  icon?: string;
  defaultData: Record<string, unknown>;
}

export interface ThemeGlobalVariables {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
    baseSize?: string;
  };
  buttons?: {
    borderRadius?: string;
    padding?: string;
    style?: 'filled' | 'outline';
  };
  cards?: {
    borderRadius?: string;
    shadow?: string;
    padding?: string;
  };
  spacing?: {
    sectionPadding?: string;
    elementGap?: string;
  };
  borderRadius?: string;
}

export interface SiteGlobalSettings {
  metaTitle?: string;
  metaDescription?: string;
  faviconUrl?: string;
  isActive?: boolean;
}

export interface ThemeConfig {
  slug: string;
  name: string;
  description?: string;
  version?: string;
  previewImageUrl?: string;
  sections: SectionDefinition[];
  globalVariables: ThemeGlobalVariables;
  enterpriseVariables: string[];
}

export interface SiteSection {
  id: string;
  type: string;
  dataSource: SectionDataSource;
  data: Record<string, unknown>;
  config?: Record<string, unknown>;
  hidden?: boolean;
  animation?: SectionAnimation;
}

export interface SitePage {
  id: string;
  slug: string;
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  sections: SiteSection[];
}

export interface SiteConfig {
  theme: string;
  settings: ThemeGlobalVariables & { siteSettings?: SiteGlobalSettings };
  pages: SitePage[];
  sections?: SiteSection[]; // deprecated — migrated to pages on load
}

// Extended site record with publishing fields
export interface SiteV2 extends Site {
  published_subdomain?: string;
  published_domain?: string;
  is_published?: boolean;
  enterprise_id?: number;
  site_config?: SiteConfig | null;
}

export interface ClientOverride {
  id: string;
  site_id: string;
  section_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BlogPost {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  cover_image_url?: string;
  published_at?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManagedTheme {
  id: string;
  slug: string;
  name: string;
  description?: string;
  preview_image_url?: string;
  config: Partial<ThemeConfig>;
  is_enabled: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

// New editor state based on SiteConfig (replaces element-tree approach)
export type SiteConfigAction =
  | { type: 'LOAD_CONFIG'; payload: { config: SiteConfig } }
  | { type: 'ADD_SECTION'; payload: { section: SiteSection; index?: number; pageId?: string } }
  | { type: 'REMOVE_SECTION'; payload: { sectionId: string; pageId?: string } }
  | { type: 'UPDATE_SECTION'; payload: { sectionId: string; data: Partial<SiteSection>; pageId?: string } }
  | { type: 'REORDER_SECTIONS'; payload: { fromIndex: number; toIndex: number; pageId?: string } }
  | { type: 'UPDATE_SETTINGS'; payload: { settings: Partial<ThemeGlobalVariables & { siteSettings?: SiteGlobalSettings }> } }
  | { type: 'SET_THEME'; payload: { theme: string } }
  | { type: 'TOGGLE_SECTION_VISIBILITY'; payload: { sectionId: string; pageId?: string } }
  | { type: 'SELECT_SECTION'; payload: { sectionId: string | null } }
  | { type: 'ADD_PAGE'; payload: { page: SitePage } }
  | { type: 'REMOVE_PAGE'; payload: { pageId: string } }
  | { type: 'UPDATE_PAGE'; payload: { pageId: string; data: Partial<Omit<SitePage, 'id' | 'sections'>> } }
  | { type: 'SET_ACTIVE_PAGE'; payload: { pageId: string } };

export interface SiteTemplate {
  id: string;
  name: string;
  description?: string;
  preview_image_url?: string;
  category?: string;
  site_config: SiteConfig;
  created_at: string;
  updated_at: string;
}

export interface SiteConfigState {
  config: SiteConfig;
  isDirty: boolean;
  selectedSectionId: string | null;
  activePageId: string | null;
}
