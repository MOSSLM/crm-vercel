import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { SiteConfig, StyleGuide, SitemapPage } from "@/types";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", params.siteId)
    .single();
  if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);
  return json(data);
});

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const { name, description, site_config, enterprise_id, lead_magnet_project_id, style_guide, sitemap } = body as {
    name?: string;
    description?: string;
    site_config?: SiteConfig;
    enterprise_id?: number | null;
    lead_magnet_project_id?: string | null;
    style_guide?: StyleGuide;
    sitemap?: SitemapPage[];
  };

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (site_config !== undefined) patch.site_config = site_config;
  if (enterprise_id !== undefined) patch.enterprise_id = enterprise_id;
  if (lead_magnet_project_id !== undefined) patch.lead_magnet_project_id = lead_magnet_project_id;
  if (style_guide !== undefined) patch.style_guide = style_guide;
  if (sitemap !== undefined) patch.sitemap = sitemap;

  // When linking a company without an explicit project, auto-link that
  // enterprise's lead-magnet project so its reviews (lead_magnet_reviews)
  // resolve. (Each enterprise has at most one project.)
  if (enterprise_id != null && lead_magnet_project_id === undefined) {
    const { data: proj } = await supabase
      .from("lead_magnet_projects")
      .select("id")
      .eq("entreprise_id", enterprise_id)
      .limit(1)
      .maybeSingle();
    if (proj && (proj as { id?: string }).id) patch.lead_magnet_project_id = (proj as { id: string }).id;
  }

  if (Object.keys(patch).length === 0) return jsonError("Aucun champ à mettre à jour", 400);

  const { data, error } = await supabase
    .from("sites")
    .update(patch)
    .eq("id", params.siteId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data);
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { error } = await supabase.from("sites").delete().eq("id", params.siteId);
  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
});
