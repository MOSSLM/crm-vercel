import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_DOMAIN } from "@/lib/site-domain";

/** A demo/published site GA4 traffic can be attributed to, by hostname. */
export interface DemoSite {
  id: string;
  /** Hôte principal (`{sous-domaine}.{SITE_DOMAIN}`) — sert d'identifiant d'affichage. */
  hostname: string;
  /**
   * TOUS les hôtes sur lesquels ce site répond, domaine personnalisé compris.
   * Un site publié sur le domaine du client porte le même tag GA4 (le
   * middleware réécrit vers /site/{host}, donc le layout (public) s'applique) :
   * sans son domaine ici, ses sessions seraient inattribuables et le site
   * apparaîtrait à tort dans « livrés, jamais ouverts ».
   */
  hostnames: string[];
  slug: string;
  /** Entreprise propriétaire — sert à greffer l'intention sur une fiche CRM. */
  enterpriseId: number | null;
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
    .select("id, published_subdomain, published_domain, published_at, enterprise_id, entreprises(name, ville, service_tags)")
    .not("published_subdomain", "is", null)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`listDemoSites: ${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      published_subdomain: string;
      published_domain: string | null;
      published_at: string | null;
      enterprise_id: number | null;
      entreprises: { name: string | null; ville: string | null; service_tags: string[] | string | null } | null;
    };
    const tags = r.entreprises?.service_tags;
    const sector = Array.isArray(tags) ? tags[0] ?? null : typeof tags === "string" ? tags.split(",")[0]?.trim() || null : null;
    const hostname = `${r.published_subdomain}.${SITE_DOMAIN}`;
    // GA4 renvoie l'hôte tel que servi : le domaine nu ET son www.
    const custom = (r.published_domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const hostnames = [hostname, ...(custom ? [custom, custom.startsWith("www.") ? custom.slice(4) : `www.${custom}`] : [])];
    return {
      id: r.id,
      hostname,
      hostnames: [...new Set(hostnames)],
      slug: r.published_subdomain,
      enterpriseId: r.enterprise_id,
      companyName: r.entreprises?.name || r.published_subdomain,
      city: r.entreprises?.ville ?? null,
      sector,
      publishedAt: r.published_at,
    };
  });
}
