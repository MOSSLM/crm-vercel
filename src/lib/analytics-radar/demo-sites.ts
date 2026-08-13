import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_DOMAIN } from "@/lib/site-domain";

/** A demo/published site GA4 traffic can be attributed to, by hostname. */
export interface DemoSite {
  id: string;
  hostname: string;
  slug: string;
  companyName: string;
  city: string | null;
  sector: string | null;
  publishedAt: string | null;
}

/**
 * Every site with a live hostname (`{subdomain}.{SITE_DOMAIN}`) — demo or
 * published, both get GA4 traffic from prospects opening the link. GA4's
 * automatic `hostName` dimension is what lets the radar attribute sessions
 * back to a company (see src/components/analytics/PublicAnalytics.tsx).
 */
export async function listDemoSites(supabase: SupabaseClient): Promise<DemoSite[]> {
  const { data, error } = await supabase
    .from("sites")
    .select("id, published_subdomain, published_at, enterprise_id, entreprises(name, ville, service_tags)")
    .not("published_subdomain", "is", null)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`listDemoSites: ${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      published_subdomain: string;
      published_at: string | null;
      enterprise_id: number | null;
      entreprises: { name: string | null; ville: string | null; service_tags: string[] | string | null } | null;
    };
    const tags = r.entreprises?.service_tags;
    const sector = Array.isArray(tags) ? tags[0] ?? null : typeof tags === "string" ? tags.split(",")[0]?.trim() || null : null;
    return {
      id: r.id,
      hostname: `${r.published_subdomain}.${SITE_DOMAIN}`,
      slug: r.published_subdomain,
      companyName: r.entreprises?.name || r.published_subdomain,
      city: r.entreprises?.ville ?? null,
      sector,
      publishedAt: r.published_at,
    };
  });
}
