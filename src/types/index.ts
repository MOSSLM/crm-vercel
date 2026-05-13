
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

export interface ThemePageStructure {
  mode: 'single' | 'multi';
  requiredPages?: { slug: string; title: string }[];
  allowCustomPages?: boolean;
}

export interface ThemeSectionsLibrary {
  /** IDs des sections disponibles dans ce thème — l'IA ne peut utiliser que ces IDs */
  sectionIds: string[];
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
  pageStructure?: ThemePageStructure;
  sectionsLibrary?: ThemeSectionsLibrary;
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

export interface SiteConfigPage {
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
  pages: SiteConfigPage[];
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
  | { type: 'ADD_PAGE'; payload: { page: SiteConfigPage } }
  | { type: 'REMOVE_PAGE'; payload: { pageId: string } }
  | { type: 'UPDATE_PAGE'; payload: { pageId: string; data: Partial<Omit<SiteConfigPage, 'id' | 'sections'>> } }
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

// ─── Relume-like Dynamic Sections System ──────────────────────────────────────

export type SnippetType =
  | 'heading'
  | 'paragraph'
  | 'button'
  | 'button-group'
  | 'image'
  | 'badge'
  | 'icon'
  | 'card'
  | 'card-grid'
  | 'testimonial-grid'
  | 'faq-accordion'
  | 'contact-form'
  | 'contact-info'
  | 'stat-row'
  | 'stat-grid'
  | 'image-grid'
  | 'logo-row'
  | 'team-grid'
  | 'video'
  | 'spacer'
  | 'divider'
  | 'flex-col'
  | 'flex-row'
  | 'custom';

export interface SnippetDefinition {
  id: string;
  type: SnippetType;
  props: Record<string, unknown>;
  editable?: string[];
  children?: SnippetDefinition[];
}

export interface SectionLayout {
  type: 'stack' | 'grid' | 'flex-row';
  columns?: number | number[];
  gap?: string;
  align?: 'left' | 'center' | 'right';
}

export interface SectionStructure {
  snippets: SnippetDefinition[];
  layout: SectionLayout;
  padding?: { top?: string; bottom?: string; left?: string; right?: string };
  background?: string;
  responsive?: { mobile?: Partial<SectionLayout> };
}

// ─── Section Schema System (Shopify-like) ─────────────────────────────────────

export type SectionFieldType =
  | 'text' | 'textarea' | 'richtext' | 'url'
  | 'number' | 'range'
  | 'color' | 'color_scheme'
  | 'image_picker' | 'video_url'
  | 'select' | 'radio' | 'checkbox'
  | 'alignment' | 'font'
  | 'header' | 'paragraph'    // non-editable separators
  // ─── CRM-specific bindings (no products / collections / articles) ───────────
  | 'page_link'               // pick an internal page from sitemap (vs free URL)
  | 'icon_picker'             // Lucide icon name with autocomplete
  | 'enterprise_field'        // bind to an entreprise.* field (nom, telephone, …)
  | 'review_source'           // 'google' | 'config' | 'static'
  | 'social_links';           // grouped fb/ig/li/tw/yt fields

/** Group used to organise fields in the editor (Contenu / Style / etc.). */
export type SectionFieldGroup = 'content' | 'layout' | 'style' | 'advanced' | 'seo';

/** Visibility predicate: a field is shown only if the predicate is true. */
export interface SectionFieldVisibilityRule {
  /** ID of the field this rule depends on (lookup is in the same scope: section settings or block settings). */
  field: string;
  /** Show when target value strictly equals this. */
  equals?: unknown;
  /** Show when target value is in this list. */
  in?: unknown[];
  /** Show when target value is truthy (non-empty, not 0, not false). */
  truthy?: boolean;
}

interface SectionFieldBase {
  id: string;
  label: string;
  info?: string;
  default?: unknown;
  /** When true, the editor / validator flags an empty value. */
  required?: boolean;
  /** Editor tab grouping. Defaults to 'content' for content fields, 'style' for color/scheme. */
  group?: SectionFieldGroup;
  /** Hide the field unless the rule passes. */
  visible_if?: SectionFieldVisibilityRule;
}

export interface SectionTextField extends SectionFieldBase { type: 'text' | 'url'; placeholder?: string; maxLength?: number; }
export interface SectionTextareaField extends SectionFieldBase { type: 'textarea' | 'richtext'; rows?: number; maxLength?: number; placeholder?: string; }
export interface SectionNumberField extends SectionFieldBase { type: 'number'; min?: number; max?: number; step?: number; unit?: string; }
export interface SectionRangeField extends SectionFieldBase { type: 'range'; min: number; max: number; step?: number; unit?: string; }
export interface SectionColorField extends SectionFieldBase { type: 'color'; }
export interface SectionColorSchemeField extends SectionFieldBase { type: 'color_scheme'; }
export interface SectionImagePickerField extends SectionFieldBase { type: 'image_picker' | 'video_url'; }
export interface SectionSelectField extends SectionFieldBase {
  type: 'select' | 'radio';
  options: { label: string; value: string }[];
}
export interface SectionCheckboxField extends SectionFieldBase { type: 'checkbox'; }
export interface SectionAlignmentField extends SectionFieldBase { type: 'alignment'; }
export interface SectionFontField extends SectionFieldBase { type: 'font'; }
export interface SectionHeaderField { type: 'header'; content: string; group?: SectionFieldGroup; }
export interface SectionParagraphField { type: 'paragraph'; content: string; group?: SectionFieldGroup; }

// CRM-specific fields
export interface SectionPageLinkField extends SectionFieldBase { type: 'page_link'; allowExternal?: boolean; placeholder?: string; }
export interface SectionIconPickerField extends SectionFieldBase { type: 'icon_picker'; }
export interface SectionEnterpriseFieldField extends SectionFieldBase {
  type: 'enterprise_field';
  /** Restrict the pickable entreprise.* keys (otherwise the full list is offered). */
  allow?: Array<'nom' | 'telephone' | 'email' | 'adresse' | 'ville' | 'code_postal' | 'logo_url' | 'note_moyenne' | 'nombre_avis' | 'description' | 'annee_creation' | 'siret'>;
}
export interface SectionReviewSourceField extends SectionFieldBase { type: 'review_source'; }
export interface SectionSocialLinksField extends SectionFieldBase {
  type: 'social_links';
  /** Which platforms to expose. Default: facebook, instagram, linkedin, twitter. */
  platforms?: Array<'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'youtube' | 'tiktok'>;
}

export type SectionField =
  | SectionTextField | SectionTextareaField | SectionNumberField
  | SectionRangeField | SectionColorField | SectionColorSchemeField
  | SectionImagePickerField | SectionSelectField | SectionCheckboxField
  | SectionAlignmentField | SectionFontField | SectionHeaderField | SectionParagraphField
  | SectionPageLinkField | SectionIconPickerField | SectionEnterpriseFieldField
  | SectionReviewSourceField | SectionSocialLinksField;

export interface SectionBlockSchema {
  type: string;
  name: string;
  /** Lucide icon name shown in the block list. */
  icon?: string;
  /** Optional one-liner description shown when picking a block to add. */
  description?: string;
  /** Maximum instances of THIS block type per section (additionally bounded by section.max_blocks). */
  limit?: number;
  settings: SectionField[];
}

/** A canned configuration of a section, exposed to the user when adding a section. */
export interface SectionPreset {
  name: string;
  description?: string;
  /** Initial values for the section's settings (keyed by field id). */
  settings?: Record<string, unknown>;
  /** Initial blocks. `id` is generated by the editor; only `type`/`settings` are required. */
  blocks?: Array<{ type: string; settings?: Record<string, unknown> }>;
}

/** Top-level grouping shown in the section library and used to order presets. */
export type SectionCategory =
  | 'navigation' | 'hero' | 'content' | 'social-proof' | 'cta'
  | 'contact' | 'media' | 'commerce' | 'footer' | 'misc';

export interface SectionSchema {
  name: string;
  /** Short human description, also injected into the AI prompt. */
  description?: string;
  /** Library category. */
  category?: SectionCategory;
  /** Lucide icon name used in the library and editor. */
  icon?: string;
  /** Reserved Shopify-style tag — currently informational. */
  tag?: 'section' | 'header' | 'footer';
  settings: SectionField[];
  blocks?: SectionBlockSchema[];
  max_blocks?: number;
  min_blocks?: number;
  presets?: SectionPreset[];
  /** Hard limits enforced by the editor. */
  limits?: {
    /** Cap how many instances of this section type can live on a single page (e.g. 1 for navbar/footer). */
    instances_per_page?: number;
    /** Cap across the whole site. */
    instances_per_site?: number;
  };
  /** If set, the section is only addable on these template/page slugs. */
  enabled_on?: { templates?: string[] };
  /** If set, the section is hidden on these template/page slugs. */
  disabled_on?: { templates?: string[] };
}

/** A single block stored on a section instance. */
export interface SectionBlockInstance {
  id: string;
  type: string;
  settings: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────

/** A row in site_sections — the reusable section library */
export interface SiteSectionDef {
  id: string;
  name: string;
  type: string;
  category?: string;
  preview_image_url?: string;
  structure: SectionStructure;
  default_content: Record<string, unknown>;
  is_builtin: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
  /** Set when section comes from theme_sections (library) */
  code?: string;
  theme_slug?: string;
  theme_section_id?: string;
  /** Shopify-like schema defining editable settings for this section */
  schema?: SectionSchema;
}

/** A row in site_section_instances — a section placed on a site page */
export interface SiteSectionInstance {
  id: string;
  site_id: string;
  section_id: string | null;
  page_slug: string;
  sort_order: number;
  content: Record<string, unknown>;
  /** Repeatable items defined by the section schema's blocks[]. */
  blocks: SectionBlockInstance[];
  custom_style?: Record<string, unknown>;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  /** Joined from site_sections */
  section_def?: SiteSectionDef;
  /**
   * Color scheme override stored in content.__color_scheme.
   * Resolved to CSS var overrides at render time.
   * Preset: 'default' | 'alt' | 'primary' | 'secondary' | 'dark' | 'light' | 'inverted'
   */
}

/** Global style design tokens stored in sites.style_guide */
export interface StyleGuide {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    backgroundAlt: string;
    text: string;
    textMuted: string;
  };
  fonts: {
    heading: string;
    body: string;
    baseSize: string;
    scale?: number;
  };
  buttons: {
    borderRadius: string;
    padding: string;
    style: 'filled' | 'outline' | 'soft';
    hoverEffect?: 'darken' | 'lift' | 'none';
  };
  cards: {
    borderRadius: string;
    shadow: 'none' | 'sm' | 'md' | 'lg';
    padding: string;
  };
  spacing: {
    sectionPadding: string;
    elementGap: string;
    maxContentWidth: string;
  };
}

export const DEFAULT_STYLE_GUIDE: StyleGuide = {
  colors: {
    primary: '#1a56db',
    secondary: '#6b7280',
    accent: '#f59e0b',
    background: '#ffffff',
    backgroundAlt: '#f9fafb',
    text: '#111827',
    textMuted: '#6b7280',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
    baseSize: '16px',
    scale: 1.25,
  },
  buttons: {
    borderRadius: '8px',
    padding: '12px 24px',
    style: 'filled',
    hoverEffect: 'darken',
  },
  cards: {
    borderRadius: '12px',
    shadow: 'md',
    padding: '24px',
  },
  spacing: {
    sectionPadding: '80px',
    elementGap: '24px',
    maxContentWidth: '1200px',
  },
};

/** Section entry within a sitemap page (for Sitemap workspace) */
export interface SitemapSection {
  id: string;
  name: string;
  description: string;
  type?: string;
}

/** Page entry in sites.sitemap */
export interface SitemapPage {
  id: string;
  slug: string;
  title: string;
  sections?: SitemapSection[];
  metaTitle?: string;
  metaDescription?: string;
}

export type WorkspaceId = 'sitemap' | 'wireframe' | 'style-guide' | 'design';

// ── SITE MENUS ────────────────────────────────────────────────

export interface SiteMenuItem {
  id: string;
  label: string;
  url: string;
  /** If true, open in a new tab */
  external?: boolean;
  /** Submenu items for megamenu */
  children?: SiteMenuItem[];
}

export interface SiteMenus {
  nav: SiteMenuItem[];
  footer: SiteMenuItem[];
  /** Extra footer links (legal, privacy, etc.) */
  footerLegal: SiteMenuItem[];
}

// ── SITE VERSIONING ──────────────────────────────────────────

export interface SiteVersion {
  id: string;
  site_id: string;
  version_number: number;
  style_guide: StyleGuide | null;
  sitemap: SitemapPage[] | null;
  created_at: string;
  created_by: string | null;
  change_description: string | null;
}

/** State for the Relume-like builder */
export interface RelumeBuilderState {
  siteId: string;
  siteName: string;
  styleGuide: StyleGuide;
  sitemap: SitemapPage[];
  menus: SiteMenus;
  instances: Record<string, SiteSectionInstance>;
  instancesByPage: Record<string, string[]>;
  activePage: string;
  selectedInstanceId: string | null;
  selectedSnippetId: string | null;
  deviceView: 'desktop' | 'tablet' | 'mobile';
  activeWorkspace: WorkspaceId;
  aiPanelOpen: boolean;
  stylePanelOpen: boolean;
  libraryOpen: boolean;
  isDirty: boolean;
  history: RelumeHistoryEntry[];
  historyIndex: number;
  /** Resolved enterprise variables for template substitution, e.g. { "entreprise.nom": "Acme" } */
  variableContext: Record<string, string>;
}

export interface RelumeHistoryEntry {
  instances: Record<string, SiteSectionInstance>;
  instancesByPage: Record<string, string[]>;
  styleGuide: StyleGuide;
  sitemap: SitemapPage[];
  /** Coalescing key — if the incoming entry has the same tag as the last entry, replace instead of append */
  _tag?: string;
}

export type RelumeBuilderAction =
  | { type: 'LOAD'; payload: { styleGuide: StyleGuide; sitemap: SitemapPage[]; instances: SiteSectionInstance[]; menus?: SiteMenus } }
  | { type: 'SET_ACTIVE_PAGE'; payload: string }
  | { type: 'SET_DEVICE_VIEW'; payload: 'desktop' | 'tablet' | 'mobile' }
  | { type: 'SET_WORKSPACE'; payload: WorkspaceId }
  | { type: 'SELECT_INSTANCE'; payload: string | null }
  | { type: 'SELECT_SNIPPET'; payload: string | null }
  | { type: 'ADD_INSTANCE'; payload: { instance: SiteSectionInstance; pageSlug: string; index?: number } }
  | { type: 'REMOVE_INSTANCE'; payload: string }
  | { type: 'UPDATE_INSTANCE_CONTENT'; payload: { id: string; content: Record<string, unknown> } }
  | { type: 'UPDATE_INSTANCE_STYLE'; payload: { id: string; style: Record<string, unknown> } }
  | { type: 'ADD_BLOCK'; payload: { instanceId: string; blockType: string; settings?: Record<string, unknown>; index?: number } }
  | { type: 'UPDATE_BLOCK'; payload: { instanceId: string; blockId: string; settings: Record<string, unknown> } }
  | { type: 'REMOVE_BLOCK'; payload: { instanceId: string; blockId: string } }
  | { type: 'DUPLICATE_BLOCK'; payload: { instanceId: string; blockId: string } }
  | { type: 'REORDER_BLOCKS'; payload: { instanceId: string; fromIndex: number; toIndex: number } }
  | { type: 'APPLY_PRESET'; payload: { instanceId: string; preset: SectionPreset } }
  | { type: 'REORDER_INSTANCES'; payload: { pageSlug: string; fromIndex: number; toIndex: number } }
  | { type: 'TOGGLE_INSTANCE_VISIBILITY'; payload: string }
  | { type: 'UPDATE_STYLE_GUIDE'; payload: Partial<StyleGuide> }
  | { type: 'ADD_PAGE'; payload: SitemapPage }
  | { type: 'REMOVE_PAGE'; payload: string }
  | { type: 'UPDATE_PAGE'; payload: { id: string; data: Partial<SitemapPage> } }
  | { type: 'DUPLICATE_PAGE'; payload: string }
  | { type: 'TOGGLE_AI_PANEL' }
  | { type: 'TOGGLE_STYLE_PANEL' }
  | { type: 'TOGGLE_LIBRARY' }
  | { type: 'UPDATE_MENUS'; payload: Partial<SiteMenus> }
  | { type: 'SYNC_MENUS_FROM_SITEMAP' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED' }
  | { type: 'SET_VARIABLE_CONTEXT'; payload: Record<string, string> };
