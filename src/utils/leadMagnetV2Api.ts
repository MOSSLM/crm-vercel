import { supabase } from "@/utils/supabase/client";

export type JsonMap = Record<string, unknown>;

export type LeadMagnetStatus = "draft" | "in_progress" | "ready" | "archived" | string;

export type CompanyLite = {
  id: number;
  name: string | null;
  ville?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  canonical_url?: string | null;
  site_web_canonique?: string | null;
  google_maps_url?: string | null;
  google_url?: string | null;
  logo_url?: string | null;
  service_tags?: unknown;
  google_reviews_5star?: unknown;
  note_moyenne?: number | null;
  nombre_avis?: number | null;
};

export type OpportunityLite = {
  id: string;
  name: string | null;
  pipeline_id: string | null;
  stage_id: number | null;
  entreprise_id?: number | null;
  tags?: string | null;
  flags?: string[] | null;
  lead_magnet?: boolean | null;
};

export type PipelineLite = {
  id: string;
  nom: string | null;
};

export type PipelineStageLite = {
  id: number;
  nom: string | null;
};

export type ServicePageData = {
  headline?: string | null;
  subheadline?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  trust_title?: string | null;
  is_active?: boolean;
};

export type ContactPageData = {
  headline?: string | null;
  subheadline?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  is_active?: boolean;
  page_name?: string | null;
  slug?: string | null;
  page_key?: string | null;
};

export type LeadMagnetProjectRecord = {
  id: string;
  opportunite_id?: string | null;
  entreprise_id?: number | null;
  pret_pour_lm?: boolean | null;
  statut?: string | null;

  override_entreprise_name?: string | null;
  override_city?: string | null;
  override_phone?: string | null;
  override_email?: string | null;
  override_address?: string | null;
  override_location?: string | null;

  logo_url?: string | null;
  favicon_url?: string | null;
  hero_image_url?: string | null;

  meta_title_default?: string | null;
  meta_description_default?: string | null;

  opening_hours?: string | null;
  variables?: JsonMap | null;
  service_tags_snapshot?: unknown;

  hero_title?: string | null;
  hero_subtitle?: string | null;
  hero_description?: string | null;

  cta_primary_text?: string | null;
  cta_primary_target?: string | null;
  cta_secondary_text?: string | null;

  home_slogan_template?: string | null;
  home_about_services_template?: string | null;
  home_why_choose_title_template?: string | null;

  stat_years_experience?: string | null;
  stat_satisfied_clients?: string | null;
  stat_installations_completed?: string | null;
  stat_rge_count?: string | null;

  service_page_headline_template?: string | null;
  service_page_subheadline_template?: string | null;
  service_page_trust_title_template?: string | null;

  created_at?: string | null;
  updated_at?: string | null;

  [key: string]: unknown;
};

export type LeadMagnetReviewRecord = {
  id: string;
  lead_magnet_project_id: string;
  project_id: string;
  author_name?: string | null;
  review_text?: string | null;
  rating?: number | null;
  is_manual?: boolean | null;
  is_active?: boolean | null;
  display_order?: number | null;
  source?: string | null;
  source_review_idx?: number | null;
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

const PROJECT_COLUMNS = new Set([
  "opportunite_id",
  "entreprise_id",
  "pret_pour_lm",
  "statut",
  "logo_url",
  "favicon_url",
  "hero_image_url",
  "override_entreprise_name",
  "override_city",
  "override_phone",
  "override_email",
  "override_address",
  "meta_title_default",
  "meta_description_default",
  "override_location",
  "opening_hours",
  "variables",
  "service_tags_snapshot",
  "hero_title",
  "hero_subtitle",
  "hero_description",
  "cta_primary_text",
  "cta_primary_target",
  "cta_secondary_text",
  "home_slogan_template",
  "home_about_services_template",
  "home_why_choose_title_template",
  "stat_years_experience",
  "stat_satisfied_clients",
  "stat_installations_completed",
  "stat_rge_count",
  "service_page_headline_template",
  "service_page_subheadline_template",
  "service_page_trust_title_template",
]);

const REVIEW_COLUMNS = new Set([
  "lead_magnet_project_id",
  "source",
  "source_review_idx",
  "author_name",
  "review_text",
  "rating",
  "is_manual",
  "is_active",
  "display_order",
]);

const asArray = <T,>(value: T[] | T | null | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const cleanUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;

const pickAllowed = <T extends Record<string, unknown>>(obj: T, allowed: Set<string>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => allowed.has(key) && value !== undefined),
  );

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const isMissingTableOrColumnError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("column") ||
    message.includes("relation")
  );
};

const normalizeProjectRow = (row: Record<string, unknown>): LeadMagnetProjectRecord => {
  return row as LeadMagnetProjectRecord;
};

const normalizeReviewRow = (row: Record<string, unknown>): LeadMagnetReviewRecord => {
  const leadMagnetProjectId = String(row.lead_magnet_project_id ?? "");
  return {
    ...(row as LeadMagnetReviewRecord),
    lead_magnet_project_id: leadMagnetProjectId,
    project_id: leadMagnetProjectId,
  };
};

const sortByDisplayOrder = <T extends { display_order?: number | null }>(rows: T[]) => {
  return [...rows].sort((a, b) => {
    const aOrder = Number(a.display_order ?? 0);
    const bOrder = Number(b.display_order ?? 0);
    return aOrder - bOrder;
  });
};

function normalizeReviewPayload(payload: Partial<LeadMagnetReviewRecord>): Record<string, unknown> {
  const source = payload as Record<string, unknown>;
  const leadMagnetProjectId = pickString(source.lead_magnet_project_id, source.project_id);

  if (!leadMagnetProjectId) {
    throw new Error("lead_magnet_project_id manquant pour la review.");
  }

  return pickAllowed(
    {
      ...source,
      lead_magnet_project_id: leadMagnetProjectId,
    },
    REVIEW_COLUMNS,
  );
}

function readOpportunityId(project: LeadMagnetProjectRecord): string | null {
  const value = project.opportunite_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Computes the page count for a project from its variables field.
 * Service pages are stored under variables.service_pages,
 * the contact page under variables.contact_page.
 */
function computePageCountFromProject(project: LeadMagnetProjectRecord): number {
  const vars = (project.variables ?? {}) as Record<string, unknown>;
  const servicePages = vars.service_pages;
  const servicePageCount =
    servicePages && typeof servicePages === "object" && !Array.isArray(servicePages)
      ? Object.keys(servicePages).length
      : 0;
  const hasContactPage = Boolean(vars.contact_page);
  return servicePageCount + (hasContactPage ? 1 : 0);
}

async function fetchOpportunitiesByIds(ids: string[]): Promise<Map<string, OpportunityLite>> {
  if (ids.length === 0) return new Map();

  const res = await supabase
    .from("opportunites")
    .select("id,name,pipeline_id,stage_id,entreprise_id,tags,flags,lead_magnet")
    .in("id", ids);

  if (res.error) throw res.error;

  return new Map(
    ((res.data ?? []) as OpportunityLite[]).map((row) => [row.id, row]),
  );
}

async function fetchCompaniesByIds(ids: number[]): Promise<Map<number, CompanyLite>> {
  if (ids.length === 0) return new Map();

  const res = await supabase
    .from("entreprises")
    .select(
      "id,name,ville,adresse,telephone,canonical_url,site_web_canonique,google_maps_url,google_url,service_tags,google_reviews_5star,note_moyenne,nombre_avis,logo_url",
    )
    .in("id", ids);

  if (res.error) throw res.error;

  return new Map(
    ((res.data ?? []) as CompanyLite[]).map((row) => [row.id, row]),
  );
}

async function fetchPipelinesByIds(ids: string[]): Promise<Map<string, PipelineLite>> {
  if (ids.length === 0) return new Map();

  const res = await supabase.from("pipelines").select("id,nom").in("id", ids);
  if (res.error) throw res.error;

  return new Map(((res.data ?? []) as PipelineLite[]).map((row) => [row.id, row]));
}

async function fetchStagesByIds(ids: number[]): Promise<Map<number, PipelineStageLite>> {
  if (ids.length === 0) return new Map();

  const res = await supabase.from("etapes_pipeline").select("id,nom").in("id", ids);
  if (res.error) throw res.error;

  return new Map(((res.data ?? []) as PipelineStageLite[]).map((row) => [row.id, row]));
}

async function fetchActiveReviewCountsByProjectIds(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const res = await supabase
    .from("lead_magnet_reviews")
    .select("lead_magnet_project_id,is_active")
    .in("lead_magnet_project_id", ids);

  if (res.error) throw res.error;

  const counts = new Map<string, number>();
  for (const row of (res.data ?? []) as Array<{ lead_magnet_project_id: string; is_active?: boolean | null }>) {
    if (row.is_active === false) continue;
    const projectId = row.lead_magnet_project_id;
    counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  }
  return counts;
}

export async function listLeadMagnetCards(): Promise<LeadMagnetListItem[]> {
  const projectsRes = await supabase
    .from("lead_magnet_projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (projectsRes.error) throw projectsRes.error;

  const projects = ((projectsRes.data ?? []) as Record<string, unknown>[]).map(normalizeProjectRow);
  if (projects.length === 0) return [];

  const opportunityIds = Array.from(
    new Set(projects.map(readOpportunityId).filter((value): value is string => Boolean(value))),
  );

  const opportunityMap = await fetchOpportunitiesByIds(opportunityIds);

  const companyIds = Array.from(
    new Set(
      projects
        .map((project) => project.entreprise_id)
        .filter((value): value is number => typeof value === "number"),
    ),
  );

  const companyMap = await fetchCompaniesByIds(companyIds);

  const pipelineIds = Array.from(
    new Set(
      Array.from(opportunityMap.values())
        .map((opp) => opp.pipeline_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const stageIds = Array.from(
    new Set(
      Array.from(opportunityMap.values())
        .map((opp) => opp.stage_id)
        .filter((value): value is number => typeof value === "number"),
    ),
  );

  const [pipelineMap, stageMap, activeReviewCountMap] = await Promise.all([
    fetchPipelinesByIds(pipelineIds),
    fetchStagesByIds(stageIds),
    fetchActiveReviewCountsByProjectIds(projects.map((p) => p.id)),
  ]);

  return projects.map((project) => {
    const opportunityId = readOpportunityId(project);
    const opportunity = opportunityId ? opportunityMap.get(opportunityId) ?? null : null;
    const company =
      typeof project.entreprise_id === "number"
        ? companyMap.get(project.entreprise_id) ?? null
        : null;

    return {
      project,
      opportunity,
      company,
      pipeline: opportunity?.pipeline_id ? pipelineMap.get(opportunity.pipeline_id) ?? null : null,
      stage: typeof opportunity?.stage_id === "number" ? stageMap.get(opportunity.stage_id) ?? null : null,
      pageCount: computePageCountFromProject(project),
      activeReviewCount: activeReviewCountMap.get(project.id) ?? 0,
    };
  });
}

export async function loadLeadMagnetBundle(projectId: string) {
  const projectRes = await supabase
    .from("lead_magnet_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (projectRes.error) throw projectRes.error;

  const rawProject = projectRes.data as Record<string, unknown> | null;
  if (!rawProject) {
    return {
      project: null,
      pages: [] as LeadMagnetPageV2[],
      reviews: [] as LeadMagnetReviewRecord[],
      opportunity: null as OpportunityLite | null,
      pipeline: null as PipelineLite | null,
      stage: null as PipelineStageLite | null,
      company: null as CompanyLite | null,
    };
  }

  const project = normalizeProjectRow(rawProject);

  const reviewsRes = await supabase
    .from("lead_magnet_reviews")
    .select("*")
    .eq("lead_magnet_project_id", projectId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (reviewsRes.error) throw reviewsRes.error;

  const reviews = sortByDisplayOrder(
    ((reviewsRes.data ?? []) as Record<string, unknown>[]).map(normalizeReviewRow),
  );

  const opportunityId = readOpportunityId(project);
  let opportunity: OpportunityLite | null = null;
  let pipeline: PipelineLite | null = null;
  let stage: PipelineStageLite | null = null;
  let company: CompanyLite | null = null;

  if (opportunityId) {
    const oppRes = await supabase
      .from("opportunites")
      .select("id,name,pipeline_id,stage_id,entreprise_id,tags,flags,lead_magnet")
      .eq("id", opportunityId)
      .maybeSingle();

    if (oppRes.error) throw oppRes.error;
    opportunity = (oppRes.data ?? null) as OpportunityLite | null;

    if (opportunity?.pipeline_id) {
      const pipelineRes = await supabase
        .from("pipelines")
        .select("id,nom")
        .eq("id", opportunity.pipeline_id)
        .maybeSingle();

      if (pipelineRes.error) throw pipelineRes.error;
      pipeline = (pipelineRes.data ?? null) as PipelineLite | null;
    }

    if (typeof opportunity?.stage_id === "number") {
      const stageRes = await supabase
        .from("etapes_pipeline")
        .select("id,nom")
        .eq("id", opportunity.stage_id)
        .maybeSingle();

      if (stageRes.error) throw stageRes.error;
      stage = (stageRes.data ?? null) as PipelineStageLite | null;
    }
  }

  if (typeof project.entreprise_id === "number") {
    const companyRes = await supabase
      .from("entreprises")
      .select(
        "id,name,ville,adresse,telephone,canonical_url,site_web_canonique,google_maps_url,google_url,service_tags,google_reviews_5star,note_moyenne,nombre_avis,logo_url",
      )
      .eq("id", project.entreprise_id)
      .maybeSingle();

    if (companyRes.error) throw companyRes.error;
    company = (companyRes.data ?? null) as CompanyLite | null;
  }

  if (!company && typeof opportunity?.entreprise_id === "number") {
    const companyRes = await supabase
      .from("entreprises")
      .select(
        "id,name,ville,adresse,telephone,canonical_url,site_web_canonique,google_maps_url,google_url,service_tags,google_reviews_5star,note_moyenne,nombre_avis,logo_url",
      )
      .eq("id", opportunity.entreprise_id)
      .maybeSingle();

    if (companyRes.error) throw companyRes.error;
    company = (companyRes.data ?? null) as CompanyLite | null;
  }

  return {
    project,
    pages: [] as LeadMagnetPageV2[],
    reviews,
    opportunity,
    pipeline,
    stage,
    company,
  };
}

export async function resolveLeadMagnetProjectId(inputId: string): Promise<string | null> {
  const id = inputId.trim();
  if (!id) return null;

  const directProjectRes = await supabase
    .from("lead_magnet_projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (directProjectRes.error) throw directProjectRes.error;
  if (directProjectRes.data?.id) return String(directProjectRes.data.id);

  const byOpportunityRes = await supabase
    .from("lead_magnet_projects")
    .select("id")
    .eq("opportunite_id", id)
    .maybeSingle();

  if (byOpportunityRes.error) throw byOpportunityRes.error;
  if (byOpportunityRes.data?.id) return String(byOpportunityRes.data.id);

  const legacyRes = await supabase
    .from("production_lead_magnets")
    .select("opportunite_id")
    .eq("id", id)
    .maybeSingle();

  if (legacyRes.error) {
    if (!isMissingTableOrColumnError(legacyRes.error)) throw legacyRes.error;
    return null;
  }

  const opportunityId = legacyRes.data?.opportunite_id as string | undefined;
  if (!opportunityId) return null;

  const projectRes = await supabase
    .from("lead_magnet_projects")
    .select("id")
    .eq("opportunite_id", opportunityId)
    .maybeSingle();

  if (projectRes.error) throw projectRes.error;
  return projectRes.data?.id ? String(projectRes.data.id) : null;
}

export async function updateLeadMagnetProject(
  projectId: string,
  updates: Partial<LeadMagnetProjectRecord>,
) {
  const payload = pickAllowed(updates as Record<string, unknown>, PROJECT_COLUMNS);

  const { data, error } = await supabase
    .from("lead_magnet_projects")
    .update(cleanUndefined(payload))
    .eq("id", projectId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeProjectRow(data as Record<string, unknown>);
}

export async function createLeadMagnetReview(payload: Partial<LeadMagnetReviewRecord>) {
  const normalized = normalizeReviewPayload(payload);

  const { data, error } = await supabase
    .from("lead_magnet_reviews")
    .insert(cleanUndefined(normalized))
    .select("*")
    .single();

  if (error) throw error;
  return normalizeReviewRow(data as Record<string, unknown>);
}

export async function updateLeadMagnetReview(reviewId: string, updates: Partial<LeadMagnetReviewRecord>) {
  const normalized = pickAllowed(updates as Record<string, unknown>, REVIEW_COLUMNS);
  delete normalized.lead_magnet_project_id;

  const { data, error } = await supabase
    .from("lead_magnet_reviews")
    .update(cleanUndefined(normalized))
    .eq("id", reviewId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeReviewRow(data as Record<string, unknown>);
}

export async function deleteLeadMagnetReview(reviewId: string) {
  const { error } = await supabase.from("lead_magnet_reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

export type LeadMagnetProjectV2 = LeadMagnetProjectRecord;
export type LeadMagnetReviewV2 = LeadMagnetReviewRecord;

// ---------------------------------------------------------------------------
// Legacy stubs — lead_magnet_pages table is no longer used.
// These types/functions are kept only for backward compatibility with
// LeadMagnetPage.tsx (legacy component, not used in any active route).
// ---------------------------------------------------------------------------

export type LeadMagnetPageV2 = {
  id: string;
  lead_magnet_project_id: string;
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
  updated_at?: string | null;
  [key: string]: unknown;
};

export async function createLeadMagnetPage(_payload: Partial<LeadMagnetPageV2>): Promise<never> {
  throw new Error("lead_magnet_pages table has been removed. Use lead_magnet_projects.variables instead.");
}

export async function updateLeadMagnetPage(_pageId: string, _updates: Partial<LeadMagnetPageV2>): Promise<never> {
  throw new Error("lead_magnet_pages table has been removed. Use lead_magnet_projects.variables instead.");
}

export async function deleteLeadMagnetPage(_pageId: string): Promise<never> {
  throw new Error("lead_magnet_pages table has been removed. Use lead_magnet_projects.variables instead.");
}
