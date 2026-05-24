import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async ({ req }) => {
  const { searchParams } = new URL(req.url);
  const enterpriseIdRaw = searchParams.get("enterprise");

  if (!enterpriseIdRaw) return jsonError("enterprise param requis", 400);

  const enterpriseId = parseInt(enterpriseIdRaw, 10);
  if (isNaN(enterpriseId)) return jsonError("enterprise must be a number", 400);

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("lead_magnet_projects")
    .select("id, override_city, override_location, override_entreprise_name, statut, created_at")
    .eq("entreprise_id", enterpriseId)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  return json(data ?? []);
});
