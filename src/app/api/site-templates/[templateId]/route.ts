import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

type Params = { templateId: string };

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_templates")
    .select("*")
    .eq("id", params.templateId)
    .single();

  if (error) return jsonError(error.message, 404);
  return json(data);
});

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const { name, description, preview_image_url, category, site_config } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (preview_image_url !== undefined) updates.preview_image_url = preview_image_url?.trim() || null;
  if (category !== undefined) updates.category = category?.trim() || "general";
  if (site_config !== undefined) updates.site_config = site_config;

  const { data, error } = await supabase
    .from("site_templates")
    .update(updates)
    .eq("id", params.templateId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data);
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("site_templates")
    .delete()
    .eq("id", params.templateId);

  if (error) return jsonError(error.message, 500);
  return new Response(null, { status: 204 });
});
