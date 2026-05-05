import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

// Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron requests.
const verifyCron = (req: Request): boolean => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // skip check in local dev if not configured
  return req.headers.get("authorization") === `Bearer ${secret}`;
};

export async function GET(req: Request) {
  if (!verifyCron(req)) return jsonError("Unauthorized", 401);

  const db = getServiceClient();

  const { data: pending, error: fetchError } = await db
    .from("crm_workflow_scheduled_actions")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true });

  if (fetchError) return jsonError(fetchError.message, 500);
  if (!pending || pending.length === 0) return json({ processed: 0 });

  let processed = 0;
  const errors: string[] = [];

  for (const scheduled of pending) {
    try {
      const action = scheduled.action as Record<string, unknown>;
      const actionType = action.type as string;
      const actionParams = (action.params ?? {}) as Record<string, string>;

      if (actionType === "create_task") {
        const { data: opp } = await db
          .from("opportunites")
          .select("entreprise_id")
          .eq("id", scheduled.opportunite_id)
          .single();

        await db.from("opportunite_tasks").insert({
          opportunite_id: scheduled.opportunite_id,
          entreprise_id:  opp?.entreprise_id ?? null,
          titre:          actionParams.titre ?? "Tâche automatique",
          description:    actionParams.description ?? null,
          type:           actionParams.type ?? "relance",
          due_date:       new Date().toISOString(),
          workflow_id:    scheduled.workflow_id,
        });
      } else if (actionType === "add_note") {
        await db.from("opportunite_notes").insert({
          opportunite_id: scheduled.opportunite_id,
          theme:          "autre",
          contenu:        actionParams.content ?? "",
        });
      }

      await db
        .from("crm_workflow_scheduled_actions")
        .update({ status: "executed" })
        .eq("id", scheduled.id);

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      errors.push(`[${scheduled.id}] ${msg}`);

      // Mark as cancelled so it doesn't loop on every cron run
      await db
        .from("crm_workflow_scheduled_actions")
        .update({ status: "cancelled" })
        .eq("id", scheduled.id);
    }
  }

  return json({ processed, ...(errors.length > 0 ? { errors } : {}) });
}
