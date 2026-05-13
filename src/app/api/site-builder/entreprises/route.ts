import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// GET /api/site-builder/entreprises — list all entreprises (id + nom) for dropdowns
export async function GET() {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("entreprises")
    .select("id, nom:name")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
