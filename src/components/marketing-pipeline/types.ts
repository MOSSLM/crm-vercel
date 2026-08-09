/* Shared types for the Marketing & Web pipeline board (mirrors
 * /api/marketing-pipeline/board). Used by the data container
 * (MarketingWebPipeline) and the matrix view (PipelineMatrix). */

export interface BoardItem {
  id: string;
  name: string;
  entreprise_id: number | null;
  pipeline_id: string | null;
  company_name: string | null;
  company_url: string | null;
  logo_url: string | null;
  ville: string | null;
  priorite: string | null;
  montant: number | null;
  type: string | null;
  mrr: number | null;
  recurrence_months: number | null;
  tags: string | null;
  enriched: boolean;
  enrichment: { status: string | null; website_url: string | null } | null;
  project: {
    id: string;
    pret_pour_lm: boolean;
    enrichment_validated: boolean;
    statut: string | null;
    enrichment_error: string | null;
    enrichment_attempts: number | null;
  } | null;
  site: {
    id: string;
    name: string | null;
    build_stage: string;
    is_published: boolean;
    url: string | null;
    /** Sous-domaine déployé, ou null quand le site n'est encore qu'un brouillon.
     *  Distinct de `url`, qui vaut null dans ce second cas : c'est ce champ qui
     *  permet à `demoShareUrl` de produire le lien d'aperçu. */
    published_subdomain?: string | null;
    /** Vignette de partage déjà fabriquée, ou null si elle reste à faire. */
    og_image_url?: string | null;
    is_claude_design: boolean;
    /** Template dont le site est issu — absent tant que la migration
     *  `20260730_sites_source_template.sql` n'est pas appliquée, ou pour un
     *  site créé avant elle. */
    template_id?: string | null;
    template_name?: string | null;
  } | null;
  audit: { id: string; statut: string; pdf_url: string | null } | null;
  agent: { id: string; name: string } | null;
  missing_for_site: string[];
  /**
   * Tickets (notes agent ↔ admin) de la ligne. Optionnel : une réponse d'API
   * antérieure à la fonctionnalité ne le porte pas.
   */
  notes?: NoteSummary | null;
  /**
   * Archivage. Optionnel : une réponse d'API antérieure à la migration
   * `20260809_archivage_motive_et_concurrents.sql` ne les porte pas.
   */
  archived_at?: string | null;
  archive_reason?: string | null;
  archive_note?: string | null;
  column: number;
}

/** Étape visée par un ticket — sert à poser le badge sur la bonne carte. */
export type NoteSubject = "enrichment" | "site" | "audit" | "other";
export type NoteSeverity = "info" | "probleme" | "bloquant";
export type NoteStatus = "open" | "in_progress" | "resolved";

export interface NoteSummary {
  open: number;
  total: number;
  open_subjects: NoteSubject[];
}

export interface NoteMessage {
  id: string;
  author_id: string | null;
  author_name: string;
  author_role: "agent" | "admin";
  body: string;
  created_at: string;
}

export interface Note {
  id: string;
  opportunite_id: string;
  entreprise_id: number | null;
  subject: NoteSubject;
  severity: NoteSeverity;
  title: string;
  status: NoteStatus;
  created_by: string | null;
  created_by_name: string;
  created_by_role: "agent" | "admin";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  company_name: string | null;
  messages: NoteMessage[];
}

export interface TemplateRef {
  id: string;
  name: string;
  is_claude_design: boolean;
}

export interface AgentRef {
  id: string;
  name: string;
}

export interface PipelineRef {
  id: string;
  nom: string;
  is_default: boolean;
}

export interface BoardData {
  items: BoardItem[];
  templates: TemplateRef[];
  agents: AgentRef[];
  pipelines: PipelineRef[];
  has_validated_column: boolean;
}

/**
 * Actions de masse, déclenchées depuis la barre de sélection sur toutes les
 * lignes cochées. Chaque action ne reçoit que les lignes pour lesquelles elle a
 * un sens (la barre filtre en amont et affiche ce compte), et tape sur les mêmes
 * fonctions batch que les actions par carte — elles ont toujours pris un tableau.
 */
export interface BulkHandlers {
  onEnrich: (items: BoardItem[], overwrite: boolean) => void;
  /**
   * Ouvre la grille de complétion sur ces lignes. Sert aussi bien la barre de
   * sélection que le bouton de la toolbar, qui lui passe toutes les lignes
   * visibles encore incomplètes — cocher soixante cases avant de commencer
   * n'aurait rien fait gagner.
   */
  onComplete: (items: BoardItem[]) => void;
  onValidateEnrich: (items: BoardItem[]) => void;
  onCreateSites: (items: BoardItem[]) => void;
  /**
   * Refait des sites DÉJÀ existants depuis le template choisi en haut de page.
   *
   * Distinct de `onCreateSites`, qui ne sait traiter que les lignes SANS site :
   * changer de modèle sur un parc déjà construit n'était possible qu'une ligne
   * à la fois. Chaque site garde son id — donc son URL publiée, son audit et
   * son avancement — seules ses pages sont reconstruites.
   */
  onRegenerateSites: (items: BoardItem[]) => void;
  /**
   * Analyse le site ACTUEL des entreprises sélectionnées (pas notre démo) et
   * enregistre les notes. Sert à prioriser le démarchage : on appelle d'abord
   * ceux dont le site est le plus faible, avec les mesures sous les yeux.
   */
  onAnalyserSites: (items: BoardItem[]) => void;
  /**
   * Fabrique à l'avance la vignette de partage des sites sélectionnés.
   *
   * Indispensable AVANT une campagne automatique : une séquence n'ouvre aucun
   * dialogue, et un robot d'unfurl abandonne bien avant qu'une carte soit
   * fabriquée. Sans carte préparée, le lien part en URL nue — et le vide est
   * mis en cache par le destinataire.
   */
  onPreparerVignettes: (items: BoardItem[]) => void;
  onValidateSites: (items: BoardItem[]) => void;
  onCreateAudits: (items: BoardItem[]) => void;
  onValidateAudits: (items: BoardItem[]) => void;
  /** Absent en mode agent : l'attribution ne fait pas partie de son pipeline. */
  onAssign?: (items: BoardItem[], agentId: string) => void;
  onMove: (items: BoardItem[], pipelineId: string) => void;
  /**
   * Archive les lignes cochées. `kind` distingue « la fiche entreprise, et ses
   * opportunités avec elle » de « cette opportunité seule ».
   */
  onArchive: (items: BoardItem[], kind: "entreprise" | "opportunite") => void;
}

/** Per-item action callbacks the matrix cells invoke (bound to real handlers). */
export interface MatrixHandlers {
  onEnrich: (item: BoardItem) => void;
  onValidateEnrich: (item: BoardItem) => void;
  onCreateSite: (item: BoardItem) => void;
  onRegenerateSite: (item: BoardItem) => void;
  onValidateSite: (item: BoardItem) => void;
  onCreateAudit: (item: BoardItem) => void;
  onValidateAudit: (item: BoardItem) => void;
  /** Absent en mode agent : l'attribution ne fait pas partie de son pipeline. */
  onAssign?: (item: BoardItem, agentId: string) => void;
  onMove: (item: BoardItem, pipelineId: string) => void;
  onDetails: (item: BoardItem) => void;
  /**
   * Ouvre le panneau des tickets de la ligne. `subject` pré-remplit l'étape
   * concernée quand on arrive depuis une carte (site, audit…).
   */
  onNotes: (item: BoardItem, subject?: NoteSubject) => void;
  /**
   * Archive cette ligne. `kind` distingue « la fiche entreprise, et ses
   * opportunités avec elle » de « cette opportunité seule ».
   */
  onArchive: (item: BoardItem, kind: "entreprise" | "opportunite") => void;
  /** Sort la ligne des archives — proposé à la place quand elle y est déjà. */
  onUnarchive: (item: BoardItem) => void;
}
