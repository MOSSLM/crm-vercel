import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ siteId: string; versionId: string }>;
}

// POST /api/site-builder/sites/[siteId]/versions/[versionId]/restore
// Restaure une version en créant une nouvelle version (= snapshot de l'ancienne)
export async function POST(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const { siteId, versionId } = await context.params;

  // Récupère la version source
  const { data: source, error: fetchErr } = await supabase
    .from("site_versions")
    .select("*")
    .eq("id", versionId)
    .eq("site_id", siteId)
    .single();

  if (fetchErr || !source) {
    return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
  }

  // Calcule le prochain numéro
  const { data: last } = await supabase
    .from("site_versions")
    .select("version_number")
    .eq("site_id", siteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (last?.version_number ?? 0) + 1;

  // Insère la restauration comme nouvelle version
  const { data: restored, error: insertErr } = await supabase
    .from("site_versions")
    .insert({
      site_id: siteId,
      version_number: nextVersion,
      style_guide: source.style_guide,
      sitemap: source.sitemap,
      change_description: `Restauration depuis v${source.version_number}`,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Met à jour le site avec les données restaurées
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (source.style_guide) updates.style_guide = source.style_guide;
  if (source.sitemap) updates.sitemap = source.sitemap;

  await supabase.from("sites").update(updates).eq("id", siteId);

  return NextResponse.json({ version: restored, message: `Restauré depuis v${source.version_number}` });
}
