import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SiteConfig, SiteSection } from "@/types";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function authenticate(request: Request): Promise<number | null> {
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

interface RouteContext {
  params: Promise<{ sectionId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { sectionId } = await context.params;
  const enterpriseId = await authenticate(request);
  if (!enterpriseId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  // Verify the section is actually client-editable for this enterprise's site
  const { data: site } = await supabase
    .from("sites")
    .select("id, site_config")
    .eq("enterprise_id", enterpriseId)
    .eq("is_published", true)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Aucun site publié" }, { status: 404 });
  }

  const config = site.site_config as SiteConfig | null;
  const section = config?.sections.find((s: SiteSection) => s.id === sectionId);

  if (!section) {
    return NextResponse.json({ error: "Section introuvable" }, { status: 404 });
  }

  if (section.dataSource !== "client-editable") {
    return NextResponse.json({ error: "Section non modifiable par le client" }, { status: 403 });
  }

  // Upsert the override
  const { error } = await supabase
    .from("client_overrides")
    .upsert(
      { site_id: site.id, section_id: sectionId, data: body },
      { onConflict: "site_id,section_id" }
    );

  if (error) {
    return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
