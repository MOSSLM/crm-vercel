import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type Params = { id: string };

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const ALLOWED = ["titre", "description", "type", "statut", "due_date", "assigned_to"];
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k)),
  );

  if (Object.keys(patch).length === 0) {
    return jsonError("Aucun champ modifiable fourni", 400, {}, cors);
  }

  const { data, error } = await getServiceClient()
    .from("opportunite_tasks")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params, cors }) => {
  const { error } = await getServiceClient()
    .from("opportunite_tasks")
    .delete()
    .eq("id", params.id);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ success: true }, { headers: cors });
});
