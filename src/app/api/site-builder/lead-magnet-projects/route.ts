import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// GET /api/site-builder/lead-magnet-projects?enterprise=<id>
// Returns lead magnet projects for a given enterprise, for the project picker in the editor.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const enterpriseIdRaw = searchParams.get("enterprise");

  if (!enterpriseIdRaw) {
    return NextResponse.json({ error: "enterprise param requis" }, { status: 400 });
  }

  const enterpriseId = parseInt(enterpriseIdRaw, 10);
  if (isNaN(enterpriseId)) {
    return NextResponse.json({ error: "enterprise must be a number" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("lead_magnet_projects")
    .select("id, override_city, override_location, override_entreprise_name, statut, created_at")
    .eq("entreprise_id", enterpriseId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
