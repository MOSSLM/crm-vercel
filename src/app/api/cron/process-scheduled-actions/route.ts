import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";

/** After this many failed attempts the row is terminal (status='failed'). */
const MAX_ATTEMPTS = 3;

/**
 * Shape of `crm_workflow_scheduled_actions.action` (jsonb). Strict enough to
 * reject malformed rows but tolerant of unknown action types — those just
 * become no-ops in the dispatcher below.
 */
const scheduledActionSchema = z.object({
  type: z.string().optional(),
  params: z.record(z.string(), z.string()).optional(),
});
type ParsedAction = z.infer<typeof scheduledActionSchema>;

/**
 * Verifies the cron request. Accepts either:
 *   - `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron), or
 *   - `x-pg-cron-secret: ${PG_CRON_SECRET}` (Supabase pg_cron).
 *
 * Vercel hobby plans are restricted to daily cron schedules, so the primary
 * scheduler for this endpoint is pg_cron (configured by the matching SQL
 * migration). The Vercel header is still accepted for the case where the
 * project moves to a paid plan or another caller wants to invoke it.
 *
 *   - prod: at least one of the two secrets MUST be set AND the matching
 *     header MUST match → fail-closed.
 *   - dev/test: when neither secret is configured, allow.
 */
const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const pgCronSecret = process.env.PG_CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !cronSecret && !pgCronSecret) {
    return false;
  }

  if (!cronSecret && !pgCronSecret) return true;

  const auth = req.headers.get("authorization");
  const pgHeader = req.headers.get("x-pg-cron-secret");
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret;
  return validVercel || validPgCron;
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
      const actionResult = scheduledActionSchema.safeParse(row.action);
      if (!actionResult.success) {
        throw new Error(`Invalid action payload: ${actionResult.error.message}`);
      }
      const action: ParsedAction = actionResult.data;
      const actionType = action.type;
      const actionParams = action.params ?? {};

      if (actionType === "create_task") {
        const { data: opp } = await db
          .from("opportunites")
          .select("entreprise_id")
          .eq("id", row.opportunite_id)
          .maybeSingle();

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
