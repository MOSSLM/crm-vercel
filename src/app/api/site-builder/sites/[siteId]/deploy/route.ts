import { revalidatePath } from "next/cache";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { publishSite } from "@/lib/site-builder/publish-site";
import { deriveSubdomainLabel, uniqueSubdomain } from "@/lib/site-builder/derive-subdomain";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr";

/**
 * POST /api/site-builder/sites/[siteId]/deploy
 *
 * Publishes a SINGLE demo site on an auto-derived subdomain (from the linked
 * company's URL/name), reusing the same snapshot path as deploy-batch. Used by
 * the kanban "Déployer" action / moving a card to "Prêt". Re-publishing keeps
 * the existing subdomain.
 */
export const POST = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const siteId = params.siteId;

  const { data: site, error } = await supabase
    .from("sites")
    .select("id, name, published_subdomain, enterprise_id")
    .eq("id", siteId)
    .single();
  if (error || !site) return jsonError("Site introuvable", 404);

  let label = (site as { published_subdomain?: string | null }).published_subdomain ?? null;

  if (!label) {
    const enterpriseId = (site as { enterprise_id?: number | null }).enterprise_id ?? null;
    type CompanySlice = { nom: string; canonical_url: string | null; site_web_canonique: string | null };
    let company: CompanySlice | null = null;
    if (enterpriseId) {
      const { data: c } = await supabase
        .from("entreprises")
        .select("nom:name, canonical_url, site_web_canonique")
        .eq("id", enterpriseId)
        .single();
      company = (c as CompanySlice | null) ?? null;
    }
    const { data: existing } = await supabase
      .from("sites")
      .select("published_subdomain")
      .not("published_subdomain", "is", null);
    const taken = new Set<string>((existing ?? []).map((s) => s.published_subdomain as string).filter(Boolean));
    label = uniqueSubdomain(
      deriveSubdomainLabel(company?.canonical_url ?? company?.site_web_canonique ?? null, company?.nom ?? (site as { name?: string }).name ?? "demo"),
      taken,
    );
  }

  const pub = await publishSite(supabase, siteId, { subdomain: label });
  if (!pub.ok) return jsonError(pub.error ?? "Publication échouée", pub.status ?? 500);
  try { revalidatePath(`/site/${label}`, "layout"); } catch { /* best effort */ }

  return json({ ok: true, subdomain: label, url: `https://${label}.${SITE_DOMAIN}` });
});
