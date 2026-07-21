/**
 * Telephony cron tick (driven by Supabase pg_cron every minute):
 *   1. apply each agent's On/Off schedule;
 *   2. flush due scheduled SMS.
 */
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { verifyCron } from "@/app/api/_lib/verify-cron";
import { resolveScheduledMode, type PhoneSchedule } from "@/lib/twilio/schedule";
import { getTwilioService } from "@/lib/twilio/service";
import { resolveAgentCallerNumber } from "@/lib/twilio/call-routing";
import { logSms } from "@/lib/twilio/sms-logging";
import { twilioWebhookUrl } from "@/lib/twilio/config";

export const runtime = "nodejs";

const MAX_SMS_ATTEMPTS = 3;

type Db = ReturnType<typeof getServiceClient>;

interface ScheduledSms {
  id: string;
  to_e164: string;
  body: string;
  from_number_id: string | null;
  agent_id: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  attempts: number;
}

const resolveFromNumber = async (
  db: Db,
  row: ScheduledSms,
): Promise<{ e164: string; numberId: string } | null> => {
  if (row.from_number_id) {
    const { data } = await db
      .from("phone_numbers")
      .select("id, e164")
      .eq("id", row.from_number_id)
      .maybeSingle();
    const n = data as { id: string; e164: string } | null;
    if (n) return { e164: n.e164, numberId: n.id };
  }
  if (row.agent_id) {
    const caller = await resolveAgentCallerNumber(db, row.agent_id);
    if (caller) return { e164: caller.e164, numberId: caller.numberId };
  }
  return null;
};

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

  // 2. Flush due scheduled SMS.
  const { data: due } = await db
    .from("scheduled_sms")
    .select("id, to_e164, body, from_number_id, agent_id, contact_id, entreprise_id, attempts")
    .eq("status", "pending")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(50);

  let smsSent = 0;
  for (const row of (due as ScheduledSms[]) ?? []) {
    const from = await resolveFromNumber(db, row);
    if (!from) {
      await db
        .from("scheduled_sms")
        .update({ status: "failed", last_error: "no_number_assigned" })
        .eq("id", row.id);
      continue;
    }
    try {
      const res = await getTwilioService().sendSms({
        from: from.e164,
        to: row.to_e164,
        body: row.body,
        statusCallback: twilioWebhookUrl("/api/twilio/sms/status"),
      });
      await logSms(db, {
        smsSid: res.sid,
        direction: "outbound",
        from: from.e164,
        to: row.to_e164,
        numberId: from.numberId,
        agentId: row.agent_id,
        contactId: row.contact_id,
        entrepriseId: row.entreprise_id,
        body: row.body,
        status: res.status,
      });
      await db
        .from("scheduled_sms")
        .update({ status: "sent", sms_sid: res.sid })
        .eq("id", row.id);
      smsSent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send_failed";
      const attempts = (row.attempts ?? 0) + 1;
      await db
        .from("scheduled_sms")
        .update({
          status: attempts >= MAX_SMS_ATTEMPTS ? "failed" : "pending",
          attempts,
          last_error: msg,
        })
        .eq("id", row.id);
    }
  }

  return json({ ok: true, modeUpdates, smsSent });
}
