import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

// POST /api/site-builder-v2/sites/[siteId]/publish
export async function POST(request: Request, context: RouteContext) {
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

    const updatePayload: Record<string, unknown> = { is_published: true };
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

// DELETE /api/site-builder-v2/sites/[siteId]/publish — unpublish
export async function DELETE(_request: Request, context: RouteContext) {
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
