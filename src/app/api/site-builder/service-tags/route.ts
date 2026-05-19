import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/site-builder/service-tags
 * Returns the sorted list of all distinct service_tag values present on at
 * least one enterprise. Used by the builder to populate the per-block /
 * per-page service_tag picker.
 */
export async function GET() {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("entreprises")
    .select("service_tags")
    .not("service_tags", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ service_tags: string[] | string | null }>) {
    const tags = Array.isArray(row.service_tags)
      ? row.service_tags
      : typeof row.service_tags === "string"
        ? [row.service_tags]
        : [];
    for (const t of tags) {
      if (typeof t === "string" && t.trim().length > 0) set.add(t.trim());
    }
  }

  return NextResponse.json({ tags: Array.from(set).sort() });
}
