import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { SerializedThemeConfig } from "@/lib/site-builder/theme-serializer";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const enterpriseId = searchParams.get("enterprise");
  const supabase = getServiceClient();

  let query = supabase
    .from("site_themes")
    .select("id, name, description, preview_image_url, config, is_builtin, enterprise_id, created_at")
    .eq("is_enabled", true)
    .order("created_at", { ascending: false });

  if (enterpriseId) {
    query = query.or(`is_public.eq.true,enterprise_id.eq.${enterpriseId}`);
  } else {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  return json(data ?? []);
});

export const POST = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const body = (await req.json()) as {
    name: string;
    description?: string;
    config: SerializedThemeConfig;
    enterprise_id?: number;
    is_public?: boolean;
  };

  const { name, description, config, enterprise_id, is_public = false } = body;

  if (!name?.trim()) return jsonError("name est requis", 400);
  if (!config || typeof config !== "object") return jsonError("config est requis", 400);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { data, error } = await supabase
    .from("site_themes")
    .insert({
      name: name.trim(),
      description: description?.trim() ?? null,
      slug: `${slug}-${Date.now()}`,
      config,
      enterprise_id: enterprise_id ?? null,
      is_public,
      is_builtin: false,
      is_enabled: true,
    })
    .select("id, name, slug")
    .single();

  if (error) return jsonError(error.message, 500);

  return json(data);
});
