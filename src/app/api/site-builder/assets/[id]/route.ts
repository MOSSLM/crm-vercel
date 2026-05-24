import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { id: string };

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data: asset, error: fetchError } = await supabase
    .from("site_builder_assets")
    .select("path")
    .eq("id", params.id)
    .single();

  if (fetchError || !asset) return jsonError("Asset not found", 404);

  await supabase.storage.from("site-builder-assets").remove([asset.path]);

  const { error: dbError } = await supabase
    .from("site_builder_assets")
    .delete()
    .eq("id", params.id);

  if (dbError) return jsonError(dbError.message, 500);
  return json({ ok: true });
});
