import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase config manquant");
  return createClient(url, key);
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const contact_id = searchParams.get("contact_id");
  const entreprise_id = searchParams.get("entreprise_id");
  const opportunite_id = searchParams.get("opportunite_id");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);

  try {
    const supabase = getSupabase();
    let query = supabase
      .from("email_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (contact_id) query = query.eq("contact_id", contact_id);
    if (entreprise_id) query = query.eq("entreprise_id", Number(entreprise_id));
    if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ logs: data ?? [] });
  } catch (err) {
    console.error("[email/logs] error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
