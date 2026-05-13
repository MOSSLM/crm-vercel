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

/**
 * GET /api/site-builder/variables?enterprise=<id>
 *
 * Returns a flat Record<string, string> of template variables resolved from
 * the selected enterprise (and, optionally, its linked opportunities / lead
 * magnet projects).  The keys match the `entreprise.*` namespace already used
 * by LibrarySectionIframe's DEFAULT_VARIABLES, so library sections substitute
 * them automatically when the variable context is non-empty.
 *
 * Example response:
 * {
 *   "entreprise.nom": "Acme Plomberie",
 *   "entreprise.ville": "Lyon",
 *   "entreprise.telephone": "04 78 00 00 00",
 *   ...
 * }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const enterpriseIdRaw = searchParams.get("enterprise");

  if (!enterpriseIdRaw) {
    return NextResponse.json({}, { status: 200 });
  }

  const enterpriseId = parseInt(enterpriseIdRaw, 10);
  if (isNaN(enterpriseId)) {
    return NextResponse.json({ error: "enterprise must be a number" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("entreprises")
    .select(
      "nom:name, ville, telephone, email, adresse, code_postal, pays, " +
      "service_tags, note_moyenne, nombre_avis, logo_url, " +
      "site_web_canonique, canonical_url"
    )
    .eq("id", enterpriseId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  const ent = data as unknown as EnterpriseVariablesRow;

  // Build service string from tags array
  const services = Array.isArray(ent.service_tags)
    ? (ent.service_tags as string[]).join(", ")
    : (typeof ent.service_tags === "string" ? ent.service_tags : "");

  const variables: Record<string, string> = {
    "entreprise.nom":         ent.nom ?? "",
    "entreprise.ville":       ent.ville ?? "",
    "entreprise.telephone":   ent.telephone ?? "",
    "entreprise.email":       ent.email ?? "",
    "entreprise.adresse":     ent.adresse ?? "",
    "entreprise.code_postal": ent.code_postal ?? "",
    "entreprise.pays":        ent.pays ?? "France",
    "entreprise.services":    services,
    "entreprise.note_moyenne":String(ent.note_moyenne ?? ""),
    "entreprise.nombre_avis": String(ent.nombre_avis ?? ""),
    "entreprise.logo_url":    ent.logo_url ?? "",
    "entreprise.site_web":    ent.site_web_canonique ?? ent.canonical_url ?? "",
    // Convenience aliases used by some section templates
    "company.name":    ent.nom ?? "",
    "company.city":    ent.ville ?? "",
    "company.phone":   ent.telephone ?? "",
    "company.email":   ent.email ?? "",
    "company.address": [ent.adresse, ent.ville].filter(Boolean).join(", "),
    "company.rating":  String(ent.note_moyenne ?? ""),
    "company.reviews": String(ent.nombre_avis ?? ""),
    "company.services":services,
    "company.logo":    ent.logo_url ?? "",
    "company.website": ent.site_web_canonique ?? ent.canonical_url ?? "",
  };

  return NextResponse.json(variables);
}
