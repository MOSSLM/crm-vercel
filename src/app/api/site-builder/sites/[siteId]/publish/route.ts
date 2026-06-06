import { revalidatePath } from "next/cache";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { publishSite } from "@/lib/site-builder/publish-site";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const { siteId } = params;

  const body = await req.json();
  const { subdomain, domain } = body as { subdomain?: string; domain?: string };

  const result = await publishSite(supabase, siteId, { subdomain, domain });
  if (!result.ok) return jsonError(result.error ?? "Erreur de publication", result.status ?? 500);

  const sub = result.publishedSubdomain;
  if (sub) {
    try { revalidatePath(`/site/${sub}`, "page"); } catch {}
    try { revalidatePath(`/site/${sub}`, "layout"); } catch {}
  }

  return json({ ok: true, site: result.site });
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
