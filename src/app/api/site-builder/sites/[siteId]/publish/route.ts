import { revalidatePath } from "next/cache";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { publishSite } from "@/lib/site-builder/publish-site";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";
import { SITE_DOMAIN } from "@/lib/site-domain";
import { normalizePublishedSubdomainInput } from "@/lib/site-builder/publish-subdomain";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const { siteId } = params;

  const body = await req.json();
  const { subdomain, domain } = body as { subdomain?: string; domain?: string };
  const normalizedSubdomain = typeof subdomain === "string" ? (normalizePublishedSubdomainInput(subdomain) ?? undefined) : undefined;
  if (subdomain && !normalizedSubdomain) return jsonError("Sous-domaine invalide", 400);

  if (normalizedSubdomain) {
    const { data: existing } = await supabase
      .from("sites")
      .select("id")
      .eq("published_subdomain", normalizedSubdomain)
      .neq("id", siteId)
      .maybeSingle();
    if (existing) return jsonError("Ce sous-domaine est déjà utilisé par un autre site", 409);
  }

  const result = await publishSite(supabase, siteId, { subdomain: normalizedSubdomain, domain });
  if (!result.ok) return jsonError(result.error ?? "Erreur de publication", result.status ?? 500);

  const sub = result.publishedSubdomain;
  if (sub) {
    try { revalidatePath(`/site/${sub}`, "page"); } catch {}
    try { revalidatePath(`/site/${sub}`, "layout"); } catch {}
  }

  invalidateSiteCache(siteId);
  // `warnings` est à destination de l'éditeur du CRM uniquement : le site
  // publié, lui, n'en sait rien et n'affiche rien de tout ça.
  return json({ ok: true, site: result.site, subdomain: result.publishedSubdomain, url: result.publishedSubdomain ? `https://${result.publishedSubdomain}.${SITE_DOMAIN}` : null, warnings: result.warnings ?? [] });
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

  invalidateSiteCache(siteId);
  return json({ ok: true, site: data });
});
