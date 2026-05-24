import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({}, async ({ cors }) => {
  const { data, error } = await getServiceClient()
    .from("lead_magnet_projects")
    .select("opportunite_id, statut, pret_pour_lm")
    .not("opportunite_id", "is", null);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
});
