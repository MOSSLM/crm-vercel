import { requireUser } from "@/app/api/_lib/auth";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { data, error } = await getServiceClient()
    .from("crm_workflows")
    .select("*, crm_workflow_executions(id, status, executed_at, trigger_data)")
    .eq("id", id)
    .single();

  if (error)
    return jsonError(error.message, error.code === "PGRST116" ? 404 : 500, {}, cors);
  return json(data, { headers: cors });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const ALLOWED = ["name", "description", "trigger_type", "trigger_conditions", "actions", "active"];
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k)),
  );

  if (Object.keys(patch).length === 0) {
    return jsonError("Aucun champ modifiable fourni", 400, {}, cors);
  }

  const { data, error } = await getServiceClient()
    .from("crm_workflows")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { error } = await getServiceClient()
    .from("crm_workflows")
    .delete()
    .eq("id", id);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ success: true }, { headers: cors });
}
