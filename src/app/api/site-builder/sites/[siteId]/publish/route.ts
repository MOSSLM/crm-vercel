import { revalidatePath } from "next/cache";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { resolveEnterpriseVariables } from "@/lib/site-builder/resolve-variables";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const { siteId } = params;

  const body = await req.json();
  const { subdomain, domain } = body as { subdomain?: string; domain?: string };

  if (!subdomain && !domain) return jsonError("subdomain ou domain requis", 400);

  if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) {
    return jsonError("Le sous-domaine ne peut contenir que des lettres minuscules, chiffres et tirets", 400);
  }

  const [{ data: currentSite }, { data: currentInstances }] = await Promise.all([
    supabase
      .from("sites")
      .select("style_guide, sitemap, site_config, enterprise_id, lead_magnet_project_id, content_overrides")
      .eq("id", siteId)
      .single(),
    supabase.from("site_section_instances")
      .select("*, section_def:site_sections (*)")
      .eq("site_id", siteId)
      .order("page_slug").order("sort_order"),
  ]);

  const siteSlice = currentSite as {
    enterprise_id: number | null;
    lead_magnet_project_id: string | null;
    content_overrides: { stats?: Array<{ label: string; value: string; display_order?: number }> } | null;
  } | null;
  const { variables: publishedVariables, reviews: publishedReviews } =
    await resolveEnterpriseVariables(supabase, {
      id: siteId,
      enterprise_id: siteSlice?.enterprise_id ?? null,
      lead_magnet_project_id: siteSlice?.lead_magnet_project_id ?? null,
      content_overrides: siteSlice?.content_overrides ?? null,
    });

  const updatePayload: Record<string, unknown> = {
    is_published: true,
    published_style_guide: currentSite?.style_guide ?? null,
    published_sitemap: currentSite?.sitemap ?? null,
    published_site_config: currentSite?.site_config ?? null,
    published_instances: currentInstances ?? [],
    published_variables: publishedVariables,
    published_reviews: publishedReviews,
    published_at: new Date().toISOString(),
  };
  if (subdomain) updatePayload.published_subdomain = subdomain;
  if (domain) updatePayload.published_domain = domain;

  const { data, error } = await supabase
    .from("sites")
    .update(updatePayload)
    .eq("id", siteId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("Ce sous-domaine est déjà utilisé par un autre site", 409);
    return jsonError(error.message, 500);
  }

  const publishedSub = (data as { published_subdomain?: string | null } | null)?.published_subdomain;
  const sub = subdomain ?? publishedSub ?? null;
  if (sub) {
    try { revalidatePath(`/site/${sub}`, "page"); } catch {}
    try { revalidatePath(`/site/${sub}`, "layout"); } catch {}
  }

  return json({ ok: true, site: data });
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { siteId } = params;

  const { data, error } = await supabase
    .from("sites")
    .update({ is_published: false })
    .eq("id", siteId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  const publishedSub = (data as { published_subdomain?: string | null } | null)?.published_subdomain;
  if (publishedSub) {
    try { revalidatePath(`/site/${publishedSub}`, "page"); } catch {}
    try { revalidatePath(`/site/${publishedSub}`, "layout"); } catch {}
  }

  return json({ ok: true, site: data });
});
