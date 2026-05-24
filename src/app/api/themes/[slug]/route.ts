import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { slug: string };

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const { is_enabled, name, description, preview_image_url, config } = body as {
    is_enabled?: boolean;
    name?: string;
    description?: string;
    preview_image_url?: string;
    config?: object;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (is_enabled !== undefined) patch.is_enabled = is_enabled;
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (preview_image_url !== undefined) patch.preview_image_url = preview_image_url;
  if (config !== undefined) patch.config = config;

  const { data, error } = await supabase
    .from("site_themes")
    .update(patch)
    .eq("slug", params.slug)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data);
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data: existing } = await supabase
    .from("site_themes")
    .select("is_builtin")
    .eq("slug", params.slug)
    .single();

  if (existing?.is_builtin) {
    return jsonError("Les thèmes intégrés ne peuvent pas être supprimés", 403);
  }

  const { error } = await supabase.from("site_themes").delete().eq("slug", params.slug);
  if (error) return jsonError(error.message, 500);
  return json({ success: true });
});
