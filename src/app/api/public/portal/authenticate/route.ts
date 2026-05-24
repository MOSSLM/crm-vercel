import { NextResponse } from "next/server";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = getServiceClient();
  try {
    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token manquant" }, { status: 400 });
    }

    const { data: company, error } = await supabase
      .from("entreprises")
      .select("id, name, client_portal_activated, client_portal_token")
      .eq("client_portal_token", token)
      .single();

    if (error || !company) {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    if (!company.client_portal_activated) {
      return NextResponse.json({ error: "Portail non activé" }, { status: 403 });
    }

    // Find the published site linked to this enterprise
    const { data: site } = await supabase
      .from("sites")
      .select("id, name, published_subdomain, site_config")
      .eq("enterprise_id", company.id)
      .eq("is_published", true)
      .single();

    return NextResponse.json({
      ok: true,
      company: { id: company.id, name: company.name },
      site: site
        ? {
            id: site.id,
            name: site.name,
            subdomain: site.published_subdomain,
          }
        : null,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
