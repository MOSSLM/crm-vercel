import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("site_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
});

export const POST = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const { name, description, preview_image_url, category, site_config } = body;

  if (!name?.trim()) return jsonError("Nom requis", 400);
  if (!site_config) return jsonError("Configuration requise", 400);

  const { data, error } = await supabase
    .from("site_templates")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      preview_image_url: preview_image_url?.trim() || null,
      category: category?.trim() || "general",
      site_config,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data, { status: 201 });
});
