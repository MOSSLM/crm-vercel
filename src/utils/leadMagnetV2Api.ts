import { supabase } from "@/utils/supabase/client";

export type JsonMap = Record<string, unknown>;

export type LeadMagnetStatus = "draft" | "in_progress" | "ready" | "archived" | string;

export type CompanyLite = {
  id: number;
  name: string | null;
  ville?: string | null;
  logo_url?: string | null;
};

export type OpportunityLite = {
  id: string;
  name: string | null;
  pipeline_id: string | null;
  stage_id: number | null;
  tags?: string | null;
  flags?: string[] | null;
  entreprises?: CompanyLite[] | CompanyLite | null;
};

export type PipelineLite = {
  id: string;
  nom: string | null;
};

export type PipelineStageLite = {
  id: number;
  nom: string | null;
};

export type LeadMagnetProjectRecord = {
  id: string;
  opportunite_id?: string | null;
  entreprise_id?: number | null;
  opportunity_id?: string | null;
  pret_pour_lm?: boolean | null;
  statut?: string | null;
  status?: string | null;
  override_entreprise_name?: string | null;
  override_city?: string | null;
  override_phone?: string | null;
  override_email?: string | null;
  override_address?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  hero_image_url?: string | null;
  meta_title_default?: string | null;
  meta_description_default?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type LeadMagnetPageRecord = {
  id: string;
  project_id: string;
  page_key?: string | null;
  page_name?: string | null;
  slug?: string | null;
  service_key?: string | null;
  is_active?: boolean | null;
  headline?: string | null;
  subheadline?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  body_json?: unknown;
  display_order?: number | null;
  ordre?: number | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type LeadMagnetReviewRecord = {
  id: string;
  project_id: string;
  author_name?: string | null;
  review_text?: string | null;
  rating?: number | null;
  is_manual?: boolean | null;
  is_active?: boolean | null;
  display_order?: number | null;
  source?: string | null;
  ordre?: number | null;
  actif?: boolean | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type LeadMagnetListItem = {
  project: LeadMagnetProjectRecord;
  opportunity: OpportunityLite | null;
  company: CompanyLite | null;
  pipeline: PipelineLite | null;
  stage: PipelineStageLite | null;
  pageCount: number;
  activeReviewCount: number;
};

const asArray = <T,>(value: T[] | T | null | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const sortByDisplayOrder = <T extends { display_order?: number | null; ordre?: number | null }>(rows: T[]) => {
  return [...rows].sort((a, b) => Number(a.display_order ?? a.ordre ?? 0) - Number(b.display_order ?? b.ordre ?? 0));
};

const readOpportunityId = (project: LeadMagnetProjectRecord): string | null => {
  const value = project.opportunite_id ?? project.opportunity_id;
  return typeof value === "string" && value ? value : null;
};

type OpportunityProjectSeed = {
  id: string;
  entreprise_id: number | null;
  lead_magnet?: boolean | null;
};

async function ensureLeadMagnetProjects(opportunityRows: OpportunityProjectSeed[]): Promise<void> {
  if (opportunityRows.length === 0) return;

  const projectRes = await supabase.from("lead_magnet_projects").select("opportunite_id");
  if (projectRes.error) throw projectRes.error;

  const existingOpportunityIds = new Set(
    ((projectRes.data ?? []) as Array<{ opportunite_id?: string | null }>)
      .map((row) => row.opportunite_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  const missingProjects = opportunityRows
    .filter((row) => typeof row.id === "string" && row.id.length > 0)
    .filter((row) => !existingOpportunityIds.has(row.id));

  if (missingProjects.length === 0) return;

  const { error: insertError } = await supabase.from("lead_magnet_projects").insert(
    missingProjects.map((row) => ({
      opportunite_id: row.id,
      entreprise_id: typeof row.entreprise_id === "number" ? row.entreprise_id : null,
      pret_pour_lm: Boolean(row.lead_magnet),
      statut: "draft",
    }))
  );

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
}

export async function listLeadMagnetCards(): Promise<LeadMagnetListItem[]> {
  const opportunityRes = await supabase
    .from("opportunites")
    .select("id,name,pipeline_id,stage_id,tags,flags,lead_magnet,entreprise_id,entreprises(id,name,ville,logo_url)")
    .order("created_at", { ascending: false });

  if (opportunityRes.error) throw opportunityRes.error;

  const opportunities = (opportunityRes.data ?? []) as (OpportunityLite & OpportunityProjectSeed)[];
  await ensureLeadMagnetProjects(opportunities);

  const { data: projects, error: projectsError } = await supabase
    .from("lead_magnet_projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (projectsError) throw projectsError;

  const projectRows = (projects ?? []) as LeadMagnetProjectRecord[];
  const [pipelinesRes, stagesRes, pagesRes, reviewsRes] = await Promise.all([
    supabase.from("pipelines").select("id,nom"),
    supabase.from("etapes_pipeline").select("id,nom"),
    supabase.from("lead_magnet_pages").select("id,project_id,is_active,actif"),
    supabase.from("lead_magnet_reviews").select("id,project_id,is_active,actif"),
  ]);

  if (pipelinesRes.error) throw pipelinesRes.error;
  if (stagesRes.error) throw stagesRes.error;
  if (pagesRes.error) throw pagesRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  const projectByOpportunityId = new Map(
    projectRows
      .map((project) => ({ project, opportunityId: readOpportunityId(project) }))
      .filter((row): row is { project: LeadMagnetProjectRecord; opportunityId: string } => Boolean(row.opportunityId))
      .map((row) => [row.opportunityId, row.project])
  );

  const pipelines = (pipelinesRes.data ?? []) as PipelineLite[];
  const pipelineById = new Map(pipelines.map((row) => [row.id, row]));

  const stages = (stagesRes.data ?? []) as PipelineStageLite[];
  const stageById = new Map(stages.map((row) => [row.id, row]));

  const pageCountByProject = new Map<string, number>();
  for (const row of pagesRes.data ?? []) {
    const projectId = String((row as { project_id?: string }).project_id ?? "");
    if (!projectId) continue;
    pageCountByProject.set(projectId, (pageCountByProject.get(projectId) ?? 0) + 1);
  }

  const activeReviewCountByProject = new Map<string, number>();
  for (const row of reviewsRes.data ?? []) {
    const reviewRow = row as { project_id?: string; is_active?: boolean | null; actif?: boolean | null };
    const projectId = String(reviewRow.project_id ?? "");
    if (!projectId) continue;
    const isActive = reviewRow.is_active ?? reviewRow.actif ?? true;
    if (isActive) {
      activeReviewCountByProject.set(projectId, (activeReviewCountByProject.get(projectId) ?? 0) + 1);
    }
  }

  const items = opportunities
    .map((opportunity): LeadMagnetListItem | null => {
      const project = projectByOpportunityId.get(opportunity.id);
      if (!project) return null;

      const company = asArray(opportunity?.entreprises)[0] ?? null;

      return {
        project,
        opportunity: opportunity as OpportunityLite,
        company,
        pipeline: opportunity.pipeline_id ? pipelineById.get(opportunity.pipeline_id) ?? null : null,
        stage: opportunity.stage_id ? stageById.get(opportunity.stage_id) ?? null : null,
        pageCount: pageCountByProject.get(project.id) ?? 0,
        activeReviewCount: activeReviewCountByProject.get(project.id) ?? 0,
      };
    });

  return items.filter((item): item is LeadMagnetListItem => item !== null);
}

export async function loadLeadMagnetBundle(projectId: string) {
  const [projectRes, pagesRes, reviewsRes] = await Promise.all([
    supabase.from("lead_magnet_projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("lead_magnet_pages").select("*").eq("project_id", projectId),
    supabase.from("lead_magnet_reviews").select("*").eq("project_id", projectId),
  ]);

  if (projectRes.error) throw projectRes.error;
  if (pagesRes.error) throw pagesRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  const project = (projectRes.data ?? null) as LeadMagnetProjectRecord | null;
  if (!project) {
    return {
      project: null,
      pages: [] as LeadMagnetPageRecord[],
      reviews: [] as LeadMagnetReviewRecord[],
      opportunity: null as OpportunityLite | null,
      pipeline: null as PipelineLite | null,
      stage: null as PipelineStageLite | null,
      company: null as CompanyLite | null,
    };
  }

  const opportunityId = readOpportunityId(project);
  let opportunity: OpportunityLite | null = null;
  let pipeline: PipelineLite | null = null;
  let stage: PipelineStageLite | null = null;
  let company: CompanyLite | null = null;

  if (opportunityId) {
    const { data: opportunityData, error: opportunityError } = await supabase
      .from("opportunites")
      .select("id,name,pipeline_id,stage_id,tags,flags,entreprises(id,name,ville,logo_url)")
      .eq("id", opportunityId)
      .maybeSingle();
    if (opportunityError) throw opportunityError;

    opportunity = (opportunityData ?? null) as OpportunityLite | null;
    company = asArray(opportunity?.entreprises)[0] ?? null;

    if (opportunity?.pipeline_id) {
      const { data: pipelineData, error: pipelineError } = await supabase
        .from("pipelines")
        .select("id,nom")
        .eq("id", opportunity.pipeline_id)
        .maybeSingle();
      if (pipelineError) throw pipelineError;
      pipeline = (pipelineData ?? null) as PipelineLite | null;
    }

    if (opportunity?.stage_id) {
      const { data: stageData, error: stageError } = await supabase
        .from("etapes_pipeline")
        .select("id,nom")
        .eq("id", opportunity.stage_id)
        .maybeSingle();
      if (stageError) throw stageError;
      stage = (stageData ?? null) as PipelineStageLite | null;
    }
  }

  return {
    project,
    pages: sortByDisplayOrder((pagesRes.data ?? []) as LeadMagnetPageRecord[]),
    reviews: sortByDisplayOrder((reviewsRes.data ?? []) as LeadMagnetReviewRecord[]),
    opportunity,
    pipeline,
    stage,
    company,
  };
}

export async function updateLeadMagnetProject(projectId: string, updates: Partial<LeadMagnetProjectRecord>) {
  const { error } = await supabase.from("lead_magnet_projects").update(updates).eq("id", projectId);
  if (error) throw error;
}

export async function createLeadMagnetPage(payload: Partial<LeadMagnetPageRecord>) {
  const { data, error } = await supabase.from("lead_magnet_pages").insert(payload).select("*").single();
  if (error) throw error;
  return data as LeadMagnetPageRecord;
}

export async function updateLeadMagnetPage(pageId: string, updates: Partial<LeadMagnetPageRecord>) {
  const { error } = await supabase.from("lead_magnet_pages").update(updates).eq("id", pageId);
  if (error) throw error;
}

export async function deleteLeadMagnetPage(pageId: string) {
  const { error } = await supabase.from("lead_magnet_pages").delete().eq("id", pageId);
  if (error) throw error;
}

export async function createLeadMagnetReview(payload: Partial<LeadMagnetReviewRecord>) {
  const { data, error } = await supabase.from("lead_magnet_reviews").insert(payload).select("*").single();
  if (error) throw error;
  return data as LeadMagnetReviewRecord;
}

export async function updateLeadMagnetReview(reviewId: string, updates: Partial<LeadMagnetReviewRecord>) {
  const { error } = await supabase.from("lead_magnet_reviews").update(updates).eq("id", reviewId);
  if (error) throw error;
}

export async function deleteLeadMagnetReview(reviewId: string) {
  const { error } = await supabase.from("lead_magnet_reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

export type LeadMagnetProjectV2 = LeadMagnetProjectRecord;
export type LeadMagnetPageV2 = LeadMagnetPageRecord;
export type LeadMagnetReviewV2 = LeadMagnetReviewRecord;
