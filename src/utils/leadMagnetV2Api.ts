import { supabase } from "@/utils/supabase/client";

export type JsonMap = Record<string, unknown>;

export type LeadMagnetProjectV2 = JsonMap & {
  id: string;
  pret_pour_lm?: boolean;
  overrides?: JsonMap | null;
  assets?: JsonMap | null;
};

export type LeadMagnetPageV2 = JsonMap & {
  id: string;
  project_id?: string;
};

export type LeadMagnetReviewV2 = JsonMap & {
  id: string;
  project_id?: string;
  ordre?: number;
  actif?: boolean;
};

const sortByOrder = <T extends JsonMap>(rows: T[]): T[] => {
  return [...rows].sort((a, b) => {
    const aOrder = Number(a.ordre ?? a.position ?? 0);
    const bOrder = Number(b.ordre ?? b.position ?? 0);
    return aOrder - bOrder;
  });
};

export async function loadLeadMagnetBundle(projectId: string) {
  const [projectRes, pagesRes, reviewsRes] = await Promise.all([
    supabase.from("lead_magnet_projects").select("*").eq("id", projectId).single(),
    supabase.from("lead_magnet_pages").select("*").eq("project_id", projectId),
    supabase.from("lead_magnet_reviews").select("*").eq("project_id", projectId),
  ]);

  if (projectRes.error) throw projectRes.error;
  if (pagesRes.error) throw pagesRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  return {
    project: (projectRes.data ?? null) as LeadMagnetProjectV2 | null,
    pages: sortByOrder((pagesRes.data ?? []) as LeadMagnetPageV2[]),
    reviews: sortByOrder((reviewsRes.data ?? []) as LeadMagnetReviewV2[]),
  };
}

export async function updateLeadMagnetProject(projectId: string, updates: Partial<LeadMagnetProjectV2>) {
  const { error } = await supabase.from("lead_magnet_projects").update(updates).eq("id", projectId);
  if (error) throw error;
}

export async function updateLeadMagnetPage(pageId: string, updates: Partial<LeadMagnetPageV2>) {
  const { error } = await supabase.from("lead_magnet_pages").update(updates).eq("id", pageId);
  if (error) throw error;
}

export async function createLeadMagnetPage(payload: Partial<LeadMagnetPageV2>) {
  const { data, error } = await supabase.from("lead_magnet_pages").insert(payload).select("*").single();
  if (error) throw error;
  return data as LeadMagnetPageV2;
}

export async function deleteLeadMagnetPage(pageId: string) {
  const { error } = await supabase.from("lead_magnet_pages").delete().eq("id", pageId);
  if (error) throw error;
}

export async function createLeadMagnetReview(payload: Partial<LeadMagnetReviewV2>) {
  const { data, error } = await supabase.from("lead_magnet_reviews").insert(payload).select("*").single();
  if (error) throw error;
  return data as LeadMagnetReviewV2;
}

export async function updateLeadMagnetReview(reviewId: string, updates: Partial<LeadMagnetReviewV2>) {
  const { error } = await supabase.from("lead_magnet_reviews").update(updates).eq("id", reviewId);
  if (error) throw error;
}

export async function deleteLeadMagnetReview(reviewId: string) {
  const { error } = await supabase.from("lead_magnet_reviews").delete().eq("id", reviewId);
  if (error) throw error;
}
