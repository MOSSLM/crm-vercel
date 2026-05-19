import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

/**
 * GET /api/entreprises/[id]/stats
 * Returns the enterprise.stats jsonb array.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const parsedId = Number(id);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "id must be a number" }, { status: 400 });
  }
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("entreprises")
    .select("stats")
    .eq("id", parsedId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const stats = Array.isArray(data?.stats) ? (data.stats as StatItem[]) : [];
  return NextResponse.json({ stats });
}

/**
 * PUT /api/entreprises/[id]/stats
 * Body: { stats: StatItem[] } — replaces the array entirely.
 */
export async function PUT(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const parsedId = Number(id);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "id must be a number" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as { stats?: unknown }).stats)) {
    return NextResponse.json({ error: "{ stats: StatItem[] } required" }, { status: 400 });
  }
  const stats = ((body as { stats: unknown[] }).stats as unknown[])
    .filter((s): s is StatItem => !!s && typeof s === "object" && typeof (s as StatItem).label === "string" && typeof (s as StatItem).value === "string")
    .map((s, i) => ({
      label: s.label,
      value: s.value,
      display_order: typeof s.display_order === "number" ? s.display_order : i,
    }));

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("entreprises")
    .update({ stats })
    .eq("id", parsedId)
    .select("stats")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stats: data.stats as StatItem[] });
}
