import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// GET /api/site-builder/entreprises — list qualified entreprises for dropdowns
export async function GET() {
  const supabase = getSupabaseServiceClient();

  const { data: companies, error } = await supabase
    .from("entreprises")
    .select("id, nom:name")
    .eq("qualifie", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (companies ?? []) as Array<{ id: number; nom: string }>;

  // Fetch which companies have a pret_pour_lm=true lead magnet project
  const pretIds = new Set<number>();
  if (list.length > 0) {
    const { data: projects } = await supabase
      .from("lead_magnet_projects")
      .select("entreprise_id")
      .eq("pret_pour_lm", true)
      .in("entreprise_id", list.map((c) => c.id));

    for (const p of projects ?? []) {
      pretIds.add(p.entreprise_id as number);
    }
  }

  return NextResponse.json(
    list.map((c) => ({ id: c.id, nom: c.nom, pret_pour_lm: pretIds.has(c.id) }))
  );
}
