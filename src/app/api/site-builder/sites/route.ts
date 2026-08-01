import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { isMissingColumn } from "@/lib/site-builder/clone-template-site";
import type { SiteConfig } from "@/types";

export const dynamic = "force-dynamic";

const SITE_COLUMNS =
  "id, name, description, is_published, published_subdomain, published_domain, enterprise_id, site_config, is_claude_design, is_template, build_stage, created_at, updated_at";

export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();

  // `source_template_id` sépare l'espace template des démos qui en sortent :
  // sans lui la liste ne peut pas dire de quel modèle vient un site. Il vient
  // d'une migration tardive — on retente sans plutôt que de vider la page.
  let columns = `${SITE_COLUMNS}, source_template_id`;
  let res = await supabase.from("sites").select(columns).order("created_at", { ascending: false });
  if (res.error && isMissingColumn(res.error)) {
    columns = SITE_COLUMNS;
    res = await supabase.from("sites").select(columns).order("created_at", { ascending: false });
  }

  if (res.error) return jsonError(res.error.message, 500);
  return json(res.data ?? []);
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
