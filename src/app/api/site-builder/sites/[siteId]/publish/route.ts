import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

// POST /api/site-builder/sites/[siteId]/publish
export async function POST(request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;

  try {
    const body = await request.json();
    const { subdomain, domain } = body as { subdomain?: string; domain?: string };

    if (!subdomain && !domain) {
      return NextResponse.json({ error: "subdomain ou domain requis" }, { status: 400 });
    }

    // Validate subdomain format
    if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) {
      return NextResponse.json(
        { error: "Le sous-domaine ne peut contenir que des lettres minuscules, chiffres et tirets" },
        { status: 400 }
      );
    }

    // Snapshot current draft → published columns
    const [{ data: currentSite }, { data: currentInstances }] = await Promise.all([
      supabase.from("sites").select("style_guide, sitemap, site_config").eq("id", siteId).single(),
      supabase.from("site_section_instances")
        .select("*, section_def:site_sections (*)")
        .eq("site_id", siteId)
        .order("page_slug").order("sort_order"),
    ]);

    const updatePayload: Record<string, unknown> = {
      is_published: true,
      published_style_guide: currentSite?.style_guide ?? null,
      published_sitemap: currentSite?.sitemap ?? null,
      published_instances: currentInstances ?? [],
      published_at: new Date().toISOString(),
    };
    if (subdomain) updatePayload.published_subdomain = subdomain;
    if (domain) updatePayload.published_domain = domain;

    const { data, error } = await supabase
      .from("sites")
      .update(updatePayload)
      .eq("id", siteId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ce sous-domaine est déjà utilisé par un autre site" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, site: data });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/site-builder/sites/[siteId]/publish — unpublish
export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId } = await context.params;

  const { data, error } = await supabase
    .from("sites")
    .update({ is_published: false })
    .eq("id", siteId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, site: data });
}
