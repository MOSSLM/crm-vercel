import { requireUser } from "@/app/api/_lib/auth";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export async function GET(req: Request) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { data, error } = await getServiceClient()
    .from("lead_magnet_projects")
    .select("opportunite_id, statut, pret_pour_lm")
    .not("opportunite_id", "is", null);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
}
