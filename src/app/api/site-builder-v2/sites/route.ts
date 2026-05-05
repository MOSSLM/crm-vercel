import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SiteConfig } from "@/types";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET /api/site-builder-v2/sites — list all sites
export async function GET() {
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, description, is_published, published_subdomain, published_domain, enterprise_id, site_config, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/site-builder-v2/sites — create a site
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, enterprise_id, site_config } = body as {
      name: string;
      description?: string;
      enterprise_id?: number;
      site_config?: SiteConfig;
    };

    if (!name) return NextResponse.json({ error: "name requis" }, { status: 400 });

    const { data, error } = await supabase
      .from("sites")
      .insert({ name, description, enterprise_id: enterprise_id ?? null, site_config: site_config ?? null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
