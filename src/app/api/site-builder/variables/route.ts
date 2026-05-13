import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

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
  variables: Record<string, string> | null;
};

type ReviewRow = {
  author_name: string | null;
  review_text: string | null;
  rating: number | null;
};

/**
 * GET /api/site-builder/variables?enterprise=<id>[&project=<uuid>]
 *
 * Returns a flat Record<string, string> of template variables. When a
 * lead_magnet_project_id is supplied, project overrides (city, phone, etc.)
 * take precedence over entreprise values, and active reviews are included as
 * a JSON-stringified array under the key "__reviews".
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const enterpriseIdRaw = searchParams.get("enterprise");
  const projectId = searchParams.get("project");

  if (!enterpriseIdRaw) {
    return NextResponse.json({}, { status: 200 });
  }

  const enterpriseId = parseInt(enterpriseIdRaw, 10);
  if (isNaN(enterpriseId)) {
    return NextResponse.json({ error: "enterprise must be a number" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const [entResult, projectResult, reviewsResult] = await Promise.all([
    supabase
      .from("entreprises")
      .select(
        "nom:name, ville, telephone, email, adresse, code_postal, pays, " +
        "service_tags, note_moyenne, nombre_avis, logo_url, " +
        "site_web_canonique, canonical_url"
      )
      .eq("id", enterpriseId)
      .single(),

    projectId
      ? supabase
          .from("lead_magnet_projects")
          .select(
            "override_entreprise_name, override_city, override_location, " +
            "override_phone, override_email, override_address, variables"
          )
          .eq("id", projectId)
          .single()
      : Promise.resolve({ data: null, error: null }),

    projectId
      ? supabase
          .from("lead_magnet_reviews")
          .select("author_name, review_text, rating")
          .eq("lead_magnet_project_id", projectId)
          .eq("is_active", true)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (entResult.error || !entResult.data) {
    return NextResponse.json({ error: entResult.error?.message ?? "Not found" }, { status: 404 });
  }

  const ent = entResult.data as unknown as EnterpriseVariablesRow;
  const proj = projectResult.data as unknown as ProjectRow | null;
  const reviews = (reviewsResult.data ?? []) as ReviewRow[];

  const services = Array.isArray(ent.service_tags)
    ? (ent.service_tags as string[]).join(", ")
    : (typeof ent.service_tags === "string" ? ent.service_tags : "");

  // Project overrides take priority over entreprise values
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
    "entreprise.services":    services,
    "entreprise.note_moyenne":String(ent.note_moyenne ?? ""),
    "entreprise.nombre_avis": String(ent.nombre_avis ?? ""),
    "entreprise.logo_url":    ent.logo_url ?? "",
    "entreprise.site_web":    ent.site_web_canonique ?? ent.canonical_url ?? "",
    // Convenience aliases
    "company.name":    nom,
    "company.city":    ville,
    "company.phone":   telephone,
    "company.email":   email,
    "company.address": [adresse, ville].filter(Boolean).join(", "),
    "company.rating":  String(ent.note_moyenne ?? ""),
    "company.reviews": String(ent.nombre_avis ?? ""),
    "company.services":services,
    "company.logo":    ent.logo_url ?? "",
    "company.website": ent.site_web_canonique ?? ent.canonical_url ?? "",
  };

  // Merge free-form project variables (lower priority than named overrides)
  if (proj?.variables && typeof proj.variables === "object") {
    for (const [k, v] of Object.entries(proj.variables)) {
      if (!(k in variables)) variables[k] = String(v);
    }
  }

  // Reviews as structured array for testimonial sections
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

  return NextResponse.json(variables);
}
