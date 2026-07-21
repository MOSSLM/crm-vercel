/**
 * List provisioned numbers + the staff they can be assigned to (admin only).
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const db = getServiceClient();

  const [{ data: numbers, error: numErr }, { data: agents, error: agentErr }] = await Promise.all([
    db
      .from("phone_numbers")
      .select(
        "id, e164, friendly_name, country, number_type, capabilities, twilio_sid, assigned_agent_id, status, monthly_cost, created_at",
      )
      .order("created_at", { ascending: false }),
    db
      .from("user_profiles")
      .select("id, full_name, email, role")
      .in("role", ["admin", "freelance"])
      .order("full_name", { ascending: true, nullsFirst: false }),
  ]);

  if (numErr) return jsonError(numErr.message, 500, {}, cors);
  if (agentErr) return jsonError(agentErr.message, 500, {}, cors);

  const nameById = new Map(
    (agents ?? []).map((a) => [a.id, a.full_name || a.email || "—"]),
  );
  const enriched = (numbers ?? []).map((n) => ({
    ...n,
    assigned_agent_name: n.assigned_agent_id ? nameById.get(n.assigned_agent_id) ?? null : null,
  }));

  return json({ numbers: enriched, agents: agents ?? [] }, { headers: cors });
});
