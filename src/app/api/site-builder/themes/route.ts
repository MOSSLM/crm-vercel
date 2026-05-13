import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { SerializedThemeConfig } from "@/lib/site-builder/theme-serializer";

export const dynamic = "force-dynamic";

// GET /api/site-builder/themes?enterprise=<id>
// Returns public themes + enterprise-specific themes
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const enterpriseId = searchParams.get("enterprise");
  const supabase = getSupabaseServiceClient();

  let query = supabase
    .from("site_themes")
    .select("id, name, description, preview_image_url, config, is_builtin, enterprise_id, created_at")
    .eq("is_enabled", true)
    .order("created_at", { ascending: false });

  if (enterpriseId) {
    // public themes OR themes belonging to this enterprise
    query = query.or(`is_public.eq.true,enterprise_id.eq.${enterpriseId}`);
  } else {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/site-builder/themes
// Body: { name, description?, config, enterprise_id?, is_public? }
export async function POST(req: Request) {
  const supabase = getSupabaseServiceClient();

  try {
    const body = await req.json() as {
      name: string;
      description?: string;
      config: SerializedThemeConfig;
      enterprise_id?: number;
      is_public?: boolean;
    };

    const { name, description, config, enterprise_id, is_public = false } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name est requis" }, { status: 400 });
    }
    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "config est requis" }, { status: 400 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const { data, error } = await supabase
      .from("site_themes")
      .insert({
        name: name.trim(),
        description: description?.trim() ?? null,
        slug: `${slug}-${Date.now()}`,
        config,
        enterprise_id: enterprise_id ?? null,
        is_public,
        is_builtin: false,
        is_enabled: true,
      })
      .select("id, name, slug")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
