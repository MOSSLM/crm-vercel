/**
 * Call scripts / playbooks shown to agents during a call. Reuses the existing
 * `call_scripts` table.
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: STAFF_ROLES }, async ({ cors }) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("call_scripts")
    .select("id, name, body, duration")
    .order("name", { ascending: true });
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ scripts: data ?? [] }, { headers: cors });
});
