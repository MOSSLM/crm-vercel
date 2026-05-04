import { requireUser } from "@/app/api/_lib/auth";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const VALID_TRIGGERS = [
  "stage_changed",
  "opportunite_created",
  "email_sent",
  "offre_accepted",
] as const;

export async function GET(req: Request) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { data, error } = await getServiceClient()
    .from("crm_workflows")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
}

export async function POST(req: Request) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const { name, description, trigger_type, trigger_conditions, actions, active } = body;

  if (!name || !trigger_type || !actions) {
    return jsonError("name, trigger_type, actions requis", 400, {}, cors);
  }

  if (!VALID_TRIGGERS.includes(trigger_type as (typeof VALID_TRIGGERS)[number])) {
    return jsonError(
      `trigger_type invalide. Valeurs acceptées: ${VALID_TRIGGERS.join(", ")}`,
      400,
      {},
      cors,
    );
  }

  const { data, error } = await getServiceClient()
    .from("crm_workflows")
    .insert({
      name,
      description: description ?? null,
      trigger_type,
      trigger_conditions: trigger_conditions ?? {},
      actions,
      active: active ?? true,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 201, headers: cors });
}
