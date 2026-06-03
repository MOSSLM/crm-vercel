import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type EnterpriseVariablesRow = {
  nom: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  pays: string | null;
  service_tags: string[] | string | null;
  stats: Array<{ label: string; value: string; display_order?: number }> | null;
  note_moyenne: number | string | null;
  nombre_avis: number | string | null;
  logo_url: string | null;
  site_web_canonique: string | null;
  canonical_url: string | null;
};

type ProjectRow = {
  override_entreprise_name: string | null;
  override_city: string | null;
  override_location: string | null;
  override_phone: string | null;
  override_email: string | null;
  override_address: string | null;
  variables: Record<string, unknown> | null;
};

type ReviewRow = {
  author_name: string | null;
  review_text: string | null;
  rating: number | null;
};

type SiteOverridesRow = {
  content_overrides: {
    stats?: Array<{ label: string; value: string; display_order?: number }>;
  } | null;
};

export const GET = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const enterpriseIdRaw = searchParams.get("enterprise");
  const projectId = searchParams.get("project");
  const siteId = searchParams.get("site");

  if (!enterpriseIdRaw) return json({});

  const enterpriseId = parseInt(enterpriseIdRaw, 10);
  if (isNaN(enterpriseId)) return jsonError("enterprise must be a number", 400);

  const supabase = getServiceClient();

  // Effective lead-magnet project: the explicit ?project param, else the
  // enterprise's own project — so reviews (lead_magnet_reviews) show in the
  // editor preview even before the site is explicitly linked to a project.
  let effectiveProjectId = projectId;
  if (!effectiveProjectId) {
    const { data: proj } = await supabase
      .from("lead_magnet_projects")
      .select("id")
      .eq("entreprise_id", enterpriseId)
      .limit(1)
      .maybeSingle();
    effectiveProjectId = (proj as { id?: string } | null)?.id ?? null;
  }

  const [entResult, projectResult, reviewsResult, siteResult] = await Promise.all([
    supabase
      .from("entreprises")
      .select(
        "nom:name, ville, telephone, email, adresse, code_postal, pays, " +
        "service_tags, stats, note_moyenne, nombre_avis, logo_url, " +
        "site_web_canonique, canonical_url"
      )
      .eq("id", enterpriseId)
      .single(),

    effectiveProjectId
      ? supabase
          .from("lead_magnet_projects")
          .select(
            "override_entreprise_name, override_city, override_location, " +
            "override_phone, override_email, override_address, variables"
          )
          .eq("id", effectiveProjectId)
          .single()
      : Promise.resolve({ data: null, error: null }),

    effectiveProjectId
      ? supabase
          .from("lead_magnet_reviews")
          .select("author_name, review_text, rating")
          .eq("lead_magnet_project_id", effectiveProjectId)
          .eq("is_active", true)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: null, error: null }),

    siteId
      ? supabase
          .from("sites")
          .select("content_overrides")
          .eq("id", siteId)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (entResult.error || !entResult.data) {
    return jsonError(entResult.error?.message ?? "Not found", 404);
  }

  const ent = entResult.data as unknown as EnterpriseVariablesRow;
  const proj = projectResult.data as unknown as ProjectRow | null;
  const reviews = (reviewsResult.data ?? []) as ReviewRow[];
  const siteOverrides = (siteResult.data as unknown as SiteOverridesRow | null)?.content_overrides ?? null;

  const serviceTags: string[] = Array.isArray(ent.service_tags)
    ? (ent.service_tags as string[])
    : (typeof ent.service_tags === "string" ? [ent.service_tags] : []);
  const servicesList = serviceTags.join(", ");

  const nom = proj?.override_entreprise_name ?? ent.nom ?? "";
  const ville = proj?.override_city ?? ent.ville ?? "";
  const telephone = proj?.override_phone ?? ent.telephone ?? "";
  const email = proj?.override_email ?? ent.email ?? "";
  const adresse = proj?.override_address ?? ent.adresse ?? "";

  const variables: Record<string, string> = {
    "entreprise.nom":         nom,
    "entreprise.ville":       ville,
    "entreprise.ville_seo":   proj?.override_city ?? "",
    "entreprise.location":    proj?.override_location ?? ville,
    "entreprise.telephone":   telephone,
    "entreprise.email":       email,
    "entreprise.adresse":     adresse,
    "entreprise.code_postal": ent.code_postal ?? "",
    "entreprise.pays":        ent.pays ?? "France",
    "entreprise.services":    servicesList,
    "entreprise.note_moyenne":String(ent.note_moyenne ?? ""),
    "entreprise.nombre_avis": String(ent.nombre_avis ?? ""),
    "entreprise.logo_url":    ent.logo_url ?? "",
    "entreprise.site_web":    ent.site_web_canonique ?? ent.canonical_url ?? "",
    "company.name":    nom,
    "company.city":    ville,
    "company.phone":   telephone,
    "company.email":   email,
    "company.address": [adresse, ville].filter(Boolean).join(", "),
    "company.rating":  String(ent.note_moyenne ?? ""),
    "company.reviews": String(ent.nombre_avis ?? ""),
    "company.services":servicesList,
    "company.logo":    ent.logo_url ?? "",
    "company.website": ent.site_web_canonique ?? ent.canonical_url ?? "",
  };

  if (proj?.variables && typeof proj.variables === "object") {
    for (const [k, v] of Object.entries(proj.variables)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "object") {
        variables[`__${k}`] = JSON.stringify(v);
      } else if (!(k in variables)) {
        variables[k] = String(v);
      }
    }
  }

  if (reviews.length > 0) {
    const reviewsArray = reviews.map((r) => ({
      name: r.author_name ?? "",
      role: "",
      text: r.review_text ?? "",
      rating: Number(r.rating ?? 5),
      avatar: "",
    }));
    variables["__reviews"] = JSON.stringify(reviewsArray);
  }

  variables["__service_tags"] = JSON.stringify(serviceTags);

  const siteStats = siteOverrides?.stats;
  const entStats = Array.isArray(ent.stats) ? ent.stats : [];
  const resolvedStats = Array.isArray(siteStats) && siteStats.length > 0 ? siteStats : entStats;
  variables["__stats"] = JSON.stringify(resolvedStats);

  return json(variables);
});
