import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/media/by-company-tags?entreprise_id=123
 *
 * Returns every media item ranked by overlap with the company's service_tags.
 * Items with the reserved tag 'all' are always included as universal.
 *
 * Response shape:
 *   { suggested: MediaLibraryItemRanked[], others: MediaLibraryItemRanked[], company_tags: string[] }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const entrepriseIdRaw = searchParams.get("entreprise_id");
  if (!entrepriseIdRaw) {
    return NextResponse.json({ error: "entreprise_id required" }, { status: 400 });
  }
  const entrepriseId = Number(entrepriseIdRaw);
  if (!Number.isFinite(entrepriseId)) {
    return NextResponse.json({ error: "entreprise_id must be a number" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  const [companyRes, rankedRes] = await Promise.all([
    supabase.from("entreprises").select("service_tags").eq("id", entrepriseId).maybeSingle(),
    supabase.rpc("media_library_by_company", { p_entreprise_id: entrepriseId }),
  ]);

  if (rankedRes.error) {
    return NextResponse.json({ error: rankedRes.error.message }, { status: 500 });
  }

  const ranked = (rankedRes.data ?? []) as Array<
    Record<string, unknown> & { match_count: number; is_universal: boolean }
  >;
  const suggested = ranked.filter((r) => r.match_count > 0 || r.is_universal);
  const others = ranked.filter((r) => !(r.match_count > 0 || r.is_universal));

  const companyTags = Array.isArray(companyRes.data?.service_tags)
    ? (companyRes.data.service_tags as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : [];

  return NextResponse.json({ suggested, others, company_tags: companyTags });
}
