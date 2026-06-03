import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Move an opportunity to another stage (kanban drop). Ownership is enforced
// by the owner_id filter, so an agent can only move their own cards.
export const PATCH = withAuth<undefined, { id: string }>(
  { role: "freelance" },
  async ({ user, params, req, cors }) => {
    const { id } = params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON invalide", 400, {}, cors);
    }
    const stageId = Number(body.stage_id);
    if (!id || !Number.isFinite(stageId)) {
      return jsonError("id et stage_id requis", 400, {}, cors);
    }

    const { data, error } = await getServiceClient()
      .from("opportunites")
      .update({ stage_id: stageId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("id, stage_id")
      .maybeSingle();

    if (error) return jsonError(error.message, 500, {}, cors);
    if (!data) return jsonError("introuvable", 404, {}, cors);
    return json(data, { headers: cors });
  },
);
