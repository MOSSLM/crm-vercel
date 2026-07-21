/**
 * Send an SMS/MMS from the agent's number. Logs the message and a KPI activity.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTwilioService } from "@/lib/twilio/service";
import { resolveAgentCallerNumber } from "@/lib/twilio/call-routing";
import { twilioWebhookUrl } from "@/lib/twilio/config";
import { logSms } from "@/lib/twilio/sms-logging";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  to: z.string().min(3),
  body: z.string().min(1).max(1600),
  contactId: z.string().optional(),
  entrepriseId: z.number().optional(),
  mediaUrl: z.array(z.string().url()).optional(),
});

export const POST = withAuth({ role: STAFF_ROLES, body: bodySchema }, async ({ user, body, cors }) => {
  const db = getServiceClient();
  const to = body.to.replace(/[^\d+]/g, "");
  if (!to) return jsonError("invalid_recipient", 400, {}, cors);

  const caller = await resolveAgentCallerNumber(db, user.id);
  if (!caller) return jsonError("no_number_assigned", 400, {}, cors);

  let sid: string | null = null;
  let status = "queued";
  let errorMessage: string | null = null;
  try {
    const res = await getTwilioService().sendSms({
      from: caller.e164,
      to,
      body: body.body,
      mediaUrl: body.mediaUrl,
      statusCallback: twilioWebhookUrl("/api/twilio/sms/status"),
    });
    sid = res.sid;
    status = res.status;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "send_failed";
    status = "failed";
  }

  await logSms(db, {
    smsSid: sid,
    direction: "outbound",
    from: caller.e164,
    to,
    numberId: caller.numberId,
    agentId: user.id,
    contactId: body.contactId ?? null,
    entrepriseId: body.entrepriseId ?? null,
    body: body.body,
    media: body.mediaUrl,
    status,
    errorMessage,
  });

  await db.from("activity_log").insert({
    owner_id: user.id,
    activity_type: "sms",
    status: "faite",
    title: `SMS envoyé — ${to}`,
    description: body.body.slice(0, 200),
    entreprise_id: body.entrepriseId ?? null,
    metadata: { to, sms_sid: sid },
  });

  if (errorMessage) return jsonError("sms_send_failed", 502, { detail: errorMessage }, cors);
  return json({ ok: true, sid, status }, { headers: cors });
});
