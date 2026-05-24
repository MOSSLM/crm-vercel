import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("site_versions")
    .select("id, site_id, version_number, created_at, created_by, change_description")
    .eq("site_id", params.siteId)
    .order("version_number", { ascending: false })
    .limit(20);

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
});

export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const body = (await req.json()) as {
    style_guide?: unknown;
    sitemap?: unknown;
    change_description?: string;
    created_by?: string;
  };

  const { data: last } = await supabase
    .from("site_versions")
    .select("version_number")
    .eq("site_id", params.siteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (last?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("site_versions")
    .insert({
      site_id: params.siteId,
      version_number: nextVersion,
      style_guide: body.style_guide ?? null,
      sitemap: body.sitemap ?? null,
      change_description: body.change_description ?? null,
      created_by: body.created_by ?? null,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data, { status: 201 });
});
