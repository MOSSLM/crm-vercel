import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/site-builder/assets/:id
 * Remove an asset from storage and the database.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  // Fetch to get the storage path
  const { data: asset, error: fetchError } = await supabase
    .from("site_builder_assets")
    .select("path")
    .eq("id", id)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Remove from storage
  await supabase.storage.from("site-builder-assets").remove([asset.path]);

  // Remove from DB
  const { error: dbError } = await supabase
    .from("site_builder_assets")
    .delete()
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
