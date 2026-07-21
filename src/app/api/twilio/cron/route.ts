/**
 * Telephony cron tick (driven by Supabase pg_cron every minute). Applies each
 * agent's On/Off schedule. Phase 4 extends this to flush scheduled SMS.
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { verifyCron } from "@/app/api/_lib/verify-cron";
import { resolveScheduledMode, type PhoneSchedule } from "@/lib/twilio/schedule";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!verifyCron(req)) return jsonError("Unauthorized", 401);

  const db = getServiceClient();
  const now = new Date();

  // 1. Apply On/Off schedules.
  const { data: settings, error } = await db
    .from("agent_phone_settings")
    .select("user_id, mode, schedule");
  if (error) return jsonError(error.message, 500);

  let modeUpdates = 0;
  for (const row of (settings as { user_id: string; mode: string; schedule: PhoneSchedule }[]) ?? []) {
    const target = resolveScheduledMode(row.schedule, now);
    if (target && target !== row.mode) {
      await db
        .from("agent_phone_settings")
        .update({ mode: target, updated_at: now.toISOString() })
        .eq("user_id", row.user_id);
      modeUpdates++;
    }
  }

  return json({ ok: true, modeUpdates });
}
