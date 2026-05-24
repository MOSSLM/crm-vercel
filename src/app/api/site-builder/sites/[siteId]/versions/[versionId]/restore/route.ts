import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { siteId: string; versionId: string };

export const POST = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { siteId, versionId } = params;

  const { data: source, error: fetchErr } = await supabase
    .from("site_versions")
    .select("*")
    .eq("id", versionId)
    .eq("site_id", siteId)
    .single();

  if (fetchErr || !source) return jsonError("Version introuvable", 404);

  const { data: last } = await supabase
    .from("site_versions")
    .select("version_number")
    .eq("site_id", siteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (last?.version_number ?? 0) + 1;

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

  if (insertErr) return jsonError(insertErr.message, 500);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (source.style_guide) updates.style_guide = source.style_guide;
  if (source.sitemap) updates.sitemap = source.sitemap;

  await supabase.from("sites").update(updates).eq("id", siteId);

  return json({ version: restored, message: `Restauré depuis v${source.version_number}` });
});
