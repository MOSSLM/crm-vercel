import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string }>;
}

interface ContentOverrides {
  services?: Record<string, Record<string, unknown>>;
  stats?: Array<{ label: string; value: string; display_order?: number }>;
  [key: string]: unknown;
}

/**
 * GET /api/site-builder/sites/[siteId]/content-overrides
 * Returns the current site.content_overrides JSON.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { siteId } = await ctx.params;
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("content_overrides")
    .eq("id", siteId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ content_overrides: (data?.content_overrides as ContentOverrides | null) ?? {} });
}

/**
 * PATCH /api/site-builder/sites/[siteId]/content-overrides
 * Body:
 *   { services?: { [slug]: {...} }, stats?: [...] }   -> shallow merge
 * The body is merged on top of the existing JSON (only provided top-level
 * keys are replaced). Pass null on a key to delete it.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  const { siteId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  const supabase = getSupabaseServiceClient();
  const { data: current, error: readErr } = await supabase
    .from("sites")
    .select("content_overrides")
    .eq("id", siteId)
    .single();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const existing = (current?.content_overrides as ContentOverrides | null) ?? {};
  const next: ContentOverrides = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete next[k];
    } else {
      next[k] = v as ContentOverrides[string];
    }
  }

  const { data, error } = await supabase
    .from("sites")
    .update({ content_overrides: next })
    .eq("id", siteId)
    .select("content_overrides")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ content_overrides: data.content_overrides as ContentOverrides });
}
