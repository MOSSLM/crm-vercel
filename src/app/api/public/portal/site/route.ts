import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { SiteConfig, SiteSection } from "@/types";

export const dynamic = "force-dynamic";

async function authenticate(request: Request) {
  const supabase = getSupabaseServiceClient();
  const token = request.headers.get("x-portal-token");
  if (!token) return null;

  const { data } = await supabase
    .from("entreprises")
    .select("id, client_portal_activated")
    .eq("client_portal_token", token)
    .single();

  if (!data?.client_portal_activated) return null;
  return data.id as number;
}

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const enterpriseId = await authenticate(request);
  if (!enterpriseId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { data: site } = await supabase
    .from("sites")
    .select("id, name, published_subdomain, site_config")
    .eq("enterprise_id", enterpriseId)
    .eq("is_published", true)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Aucun site publié" }, { status: 404 });
  }

  const config = site.site_config as SiteConfig | null;

  // Fetch client overrides
  const { data: overrides } = await supabase
    .from("client_overrides")
    .select("section_id, data")
    .eq("site_id", site.id);

  const overrideMap = Object.fromEntries(
    (overrides ?? []).map((o: { section_id: string; data: Record<string, unknown> }) => [o.section_id, o.data])
  );

  // Return only client-editable sections with merged data
  const editableSections = (config?.sections ?? [])
    .filter((s: SiteSection) => s.dataSource === "client-editable" && !s.hidden)
    .map((s: SiteSection) => ({
      id: s.id,
      type: s.type,
      data: overrideMap[s.id] ? { ...s.data, ...overrideMap[s.id] } : s.data,
    }));

  return NextResponse.json({
    siteId: site.id,
    siteName: site.name,
    subdomain: site.published_subdomain,
    editableSections,
  });
}
