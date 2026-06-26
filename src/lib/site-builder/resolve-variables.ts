/**
 * Server-side resolver: builds the enterpriseVariables map and reviews
 * array for a given site by joining `entreprises`, `lead_magnet_projects`,
 * `lead_magnet_reviews`, and `sites.content_overrides` (stats overrides only).
 *
 * Shared by:
 *  - /api/site-builder/sites/[siteId]/publish — snapshots the result into
 *    `sites.published_variables` and `sites.published_reviews`.
 *  - src/lib/site-resolver.ts — uses the snapshot when present, falls back
 *    to a fresh resolve for legacy sites that haven't republished since
 *    the snapshot columns were added.
 *
 * Note: the function is intentionally side-effect-free and accepts a
 * Supabase client instance so both server endpoints (publish route) and
 * server-side renderers (site-resolver) can share it.
 *
 * Structured collections (reviews, service tags, stats) are JSON-stringified
 * under keys prefixed with "__" so the flat string map stays compatible with
 * the existing `{{variable}}` substitution while the renderer can parse the
 * structured forms back into objects/arrays.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReviewItem {
  name: string;
  role: string;
  text: string;
  rating: number;
  avatar: string;
}

export interface ResolvedVariables {
  variables: Record<string, string>;
  reviews: ReviewItem[];
  companyName?: string;
  logoUrl?: string;
  phone?: string;
}

interface SiteRowSlice {
  enterprise_id: number | null;
  lead_magnet_project_id: string | null;
  id?: string | null;
  content_overrides?: {
    stats?: Array<{ label: string; value: string; display_order?: number }>;
  } | null;
}

export async function resolveEnterpriseVariables(
  supabase: SupabaseClient,
  site: SiteRowSlice,
): Promise<ResolvedVariables> {
  const vars: Record<string, string> = {};
  let companyName: string | undefined;
  let logoUrl: string | undefined;
  let phone: string | undefined;
  let serviceTags: string[] = [];
  let entStats: Array<{ label: string; value: string; display_order?: number }> = [];

  if (site.enterprise_id) {
    const { data: companyRaw } = await supabase
      .from("entreprises")
      .select(
        "id, name, telephone, email, adresse, ville, code_postal, logo_url, " +
        "site_web_canonique, note_moyenne, nombre_avis, service_tags, stats, horaires"
      )
      .eq("id", site.enterprise_id)
      .single();

    const company = companyRaw as unknown as {
      id: number;
      name: string | null;
      telephone: string | null;
      email: string | null;
      adresse: string | null;
      ville: string | null;
      code_postal: string | null;
      logo_url: string | null;
      site_web_canonique: string | null;
      note_moyenne: number | string | null;
      nombre_avis: number | string | null;
      service_tags: string[] | string | null;
      stats: Array<{ label: string; value: string; display_order?: number }> | null;
      horaires: string | null;
    } | null;

    if (company) {
      vars["entreprise.nom"] = company.name ?? "";
      vars["entreprise.telephone"] = company.telephone ?? "";
      vars["entreprise.email"] = company.email ?? "";
      vars["entreprise.adresse"] = company.adresse ?? "";
      vars["entreprise.ville"] = company.ville ?? "";
      vars["entreprise.code_postal"] = company.code_postal ?? "";
      vars["entreprise.logo_url"] = company.logo_url ?? "";
      vars["entreprise.site_web_canonique"] = company.site_web_canonique ?? "";
      vars["entreprise.note_moyenne"] = String(company.note_moyenne ?? "");
      vars["entreprise.nombre_avis"] = String(company.nombre_avis ?? "");
      vars["entreprise.horaires"] = company.horaires ?? "";
      companyName = company.name ?? undefined;
      logoUrl = company.logo_url ?? undefined;
      phone = company.telephone ?? undefined;

      serviceTags = Array.isArray(company.service_tags)
        ? (company.service_tags as string[])
        : (typeof company.service_tags === "string" ? [company.service_tags] : []);
      entStats = Array.isArray(company.stats)
        ? (company.stats as Array<{ label: string; value: string; display_order?: number }>)
        : [];
    }
  }

  // Effective lead-magnet project: the explicit site link, else the linked
  // enterprise's own project. This fallback makes company reviews resolve from
  // lead_magnet_reviews everywhere (editor preview, publish snapshot, deployed
  // site) even when the site has no explicit project link. Purely additive —
  // when site.lead_magnet_project_id is set the behaviour is unchanged.
  let projectId = site.lead_magnet_project_id;
  if (!projectId && site.enterprise_id) {
    const { data: proj } = await supabase
      .from("lead_magnet_projects")
      .select("id")
      .eq("entreprise_id", site.enterprise_id)
      .limit(1)
      .maybeSingle();
    projectId = (proj as { id?: string } | null)?.id ?? null;
  }

  let reviews: ReviewItem[] = [];
  if (projectId) {
    const [projResult, reviewsResult] = await Promise.all([
      supabase
        .from("lead_magnet_projects")
        .select(
          "override_entreprise_name, override_city, override_location, " +
            "override_phone, override_email, override_address, variables"
        )
        .eq("id", projectId)
        .single(),
      supabase
        .from("lead_magnet_reviews")
        .select("author_name, review_text, rating")
        .eq("lead_magnet_project_id", projectId)
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
    ]);

    const proj = projResult.data as {
      override_entreprise_name: string | null;
      override_city: string | null;
      override_location: string | null;
      override_phone: string | null;
      override_email: string | null;
      override_address: string | null;
      variables: Record<string, unknown> | null;
    } | null;
    if (proj) {
      if (proj.override_entreprise_name) {
        vars["entreprise.nom"] = proj.override_entreprise_name;
        companyName = proj.override_entreprise_name;
      }
      if (proj.override_city) vars["entreprise.ville_seo"] = proj.override_city;
      if (proj.override_location) vars["entreprise.location"] = proj.override_location;
      if (proj.override_phone) {
        vars["entreprise.telephone"] = proj.override_phone;
        phone = proj.override_phone;
      }
      if (proj.override_email) vars["entreprise.email"] = proj.override_email;
      if (proj.override_address) vars["entreprise.adresse"] = proj.override_address;
      if (proj.variables && typeof proj.variables === "object") {
        for (const [k, v] of Object.entries(proj.variables)) {
          if (v === null || v === undefined) continue;
          if (typeof v === "object") {
            vars[`__${k}`] = JSON.stringify(v);
          } else {
            vars[k] = String(v);
          }
        }
      }
    }

    reviews = ((reviewsResult.data ?? []) as Array<{ author_name: string | null; review_text: string | null; rating: number | null }>).map((r) => ({
      name: r.author_name ?? "",
      role: "",
      text: r.review_text ?? "",
      rating: Number(r.rating ?? 5),
      avatar: "",
    }));

    if (reviews.length > 0) {
      vars["__reviews"] = JSON.stringify(reviews);
    }
  }

  // Service tags of the active enterprise. Consumed by the renderers to
  // filter blocks/pages whose `service_tag` doesn't match the enterprise.
  vars["__service_tags"] = JSON.stringify(serviceTags);

  // Stats: prefer site-level overrides, fall back to enterprise stats.
  const siteStats = site.content_overrides?.stats;
  const resolvedStats = Array.isArray(siteStats) && siteStats.length > 0 ? siteStats : entStats;
  vars["__stats"] = JSON.stringify(resolvedStats);

  // Email domain (for templates that show "contact@<domain>"), derived from the
  // resolved email (after any lead-magnet override). Only set when present so a
  // missing value renders empty rather than the literal token.
  const email = vars["entreprise.email"];
  if (email && email.includes("@")) {
    vars["entreprise.email_domain"] = email.slice(email.indexOf("@") + 1);
  }

  return { variables: vars, reviews, companyName, logoUrl, phone };
}

/** Derives companyName / logoUrl / phone from a previously-snapshotted
 *  variables map. Used when reading from `published_variables`. */
export function deriveLayoutFieldsFromVariables(variables: Record<string, string>): {
  companyName?: string;
  logoUrl?: string;
  phone?: string;
} {
  const nom = variables["entreprise.nom"];
  const logo = variables["entreprise.logo_url"];
  const tel = variables["entreprise.telephone"];
  return {
    companyName: nom && nom.length > 0 ? nom : undefined,
    logoUrl: logo && logo.length > 0 ? logo : undefined,
    phone: tel && tel.length > 0 ? tel : undefined,
  };
}
