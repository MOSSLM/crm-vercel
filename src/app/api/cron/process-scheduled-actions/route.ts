import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

/** After this many failed attempts the row is terminal (status='failed'). */
const MAX_ATTEMPTS = 3;

/**
 * Verifies the cron request:
 *   - prod: CRON_SECRET MUST be set AND the header must match → fail-closed
 *   - dev/test: missing secret is allowed (local cron testing)
 */
const verifyCron = (req: Request): boolean => {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) return false;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
};

type ScheduledAction = {
  id: string;
  workflow_id: string;
  opportunite_id: string | null;
  action: { type?: string; params?: Record<string, string> } | Record<string, unknown>;
  attempts: number | null;
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

  for (const row of pending as ScheduledAction[]) {
    try {
      const action = row.action as { type?: string; params?: Record<string, string> };
      const actionType = action.type;
      const actionParams = action.params ?? {};

      if (actionType === "create_task") {
        const { data: opp } = await db
          .from("opportunites")
          .select("entreprise_id")
          .eq("id", row.opportunite_id)
          .single();

        await db.from("opportunite_tasks").insert({
          opportunite_id: row.opportunite_id,
          entreprise_id:  opp?.entreprise_id ?? null,
          titre:          actionParams.titre ?? "Tâche automatique",
          description:    actionParams.description ?? null,
          type:           actionParams.type ?? "relance",
          due_date:       new Date().toISOString(),
          workflow_id:    row.workflow_id,
        });
      } else if (actionType === "add_note") {
        await db.from("opportunite_notes").insert({
          opportunite_id: row.opportunite_id,
          theme:          "autre",
          contenu:        actionParams.content ?? "",
        });
      }

      await db
        .from("crm_workflow_scheduled_actions")
        .update({ status: "executed" })
        .eq("id", row.id);

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      errors.push(`[${row.id}] ${msg}`);

      const nextAttempts = (row.attempts ?? 0) + 1;
      const terminal = nextAttempts >= MAX_ATTEMPTS;

      await db
        .from("crm_workflow_scheduled_actions")
        .update({
          status: terminal ? "failed" : "pending",
          attempts: nextAttempts,
          last_error: msg,
        })
        .eq("id", row.id);
    }
  }

  return json({ processed, ...(errors.length > 0 ? { errors } : {}) });
}
