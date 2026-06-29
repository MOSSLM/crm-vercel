import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import type { SiteConfig } from "@/types";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, description, is_published, published_subdomain, published_domain, enterprise_id, site_config, is_claude_design, is_template, build_stage, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
});

export const POST = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const { name, description, enterprise_id, site_config } = body as {
    name: string;
    description?: string;
    enterprise_id?: number;
    site_config?: SiteConfig;
  };

  if (!name) return jsonError("name requis", 400);

  const { data, error } = await supabase
    .from("sites")
    .insert({ name, description, enterprise_id: enterprise_id ?? null, site_config: site_config ?? null })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data, { status: 201 });
});
