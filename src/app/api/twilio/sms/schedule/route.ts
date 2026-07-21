/**
 * Schedule an SMS for later. The telephony cron tick flushes due rows.
 * GET lists the caller's pending scheduled messages.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { resolveAgentCallerNumber } from "@/lib/twilio/call-routing";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: STAFF_ROLES }, async ({ user, cors }) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("scheduled_sms")
    .select("id, to_e164, body, scheduled_for, status, contact_id, entreprise_id")
    .eq("agent_id", user.id)
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true });
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ scheduled: data ?? [] }, { headers: cors });
});

const bodySchema = z.object({
  to: z.string().min(3),
  body: z.string().min(1).max(1600),
  scheduledFor: z.string().min(1),
  contactId: z.string().optional(),
  entrepriseId: z.number().optional(),
});

export const POST = withAuth({ role: STAFF_ROLES, body: bodySchema }, async ({ user, body, cors }) => {
  const db = getServiceClient();
  const to = body.to.replace(/[^\d+]/g, "");
  if (!to) return jsonError("invalid_recipient", 400, {}, cors);
  const scheduledMs = Date.parse(body.scheduledFor);
  if (Number.isNaN(scheduledMs) || scheduledMs <= Date.now()) {
    return jsonError("scheduled_in_past", 400, {}, cors);
  }

  const caller = await resolveAgentCallerNumber(db, user.id);

  const { data, error } = await db
    .from("scheduled_sms")
    .insert({
      to_e164: to,
      body: body.body,
      from_number_id: caller?.numberId ?? null,
      agent_id: user.id,
      contact_id: body.contactId ?? null,
      entreprise_id: body.entrepriseId ?? null,
      scheduled_for: body.scheduledFor,
      status: "pending",
    })
    .select("id, to_e164, body, scheduled_for, status")
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ scheduled: data }, { headers: cors });
});
