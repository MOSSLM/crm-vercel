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
    is_claude_design: boolean;
  } | null;
  audit: { id: string; statut: string; pdf_url: string | null } | null;
  agent: { id: string; name: string } | null;
  missing_for_site: string[];
  column: number;
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

/** Per-item action callbacks the matrix cells invoke (bound to real handlers). */
export interface MatrixHandlers {
  onEnrich: (item: BoardItem) => void;
  onValidateEnrich: (item: BoardItem) => void;
  onCreateSite: (item: BoardItem) => void;
  onValidateSite: (item: BoardItem) => void;
  onCreateAudit: (item: BoardItem) => void;
  onValidateAudit: (item: BoardItem) => void;
  onAssign: (item: BoardItem, agentId: string) => void;
  onMove: (item: BoardItem, pipelineId: string) => void;
  onDetails: (item: BoardItem) => void;
}
