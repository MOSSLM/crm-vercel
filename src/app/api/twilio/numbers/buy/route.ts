/**
 * Provision a number (admin only): purchase it on Twilio, wire its webhooks to
 * our inbound voice/SMS endpoints, and record it in `phone_numbers`.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTwilioService } from "@/lib/twilio/service";
import { twilioWebhookUrl } from "@/lib/twilio/config";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  phoneNumber: z.string().min(4),
  friendlyName: z.string().optional(),
  country: z.string().length(2).default("FR"),
  type: z.enum(["local", "mobile", "tollfree"]).default("local"),
  assignedAgentId: z.string().uuid().optional(),
  monthlyCost: z.number().optional(),
});

export const POST = withAuth({ role: "admin", body: bodySchema }, async ({ body, cors }) => {
  const db = getServiceClient();

  // Avoid duplicate provisioning of the same number.
  const { data: existing } = await db
    .from("phone_numbers")
    .select("id, status")
    .eq("e164", body.phoneNumber)
    .maybeSingle();
  if (existing && (existing as { status: string }).status !== "released") {
    return jsonError("number_already_provisioned", 409, {}, cors);
  }

  let provisioned;
  try {
    provisioned = await getTwilioService().buyNumber({
      phoneNumber: body.phoneNumber,
      friendlyName: body.friendlyName ?? body.phoneNumber,
      voiceUrl: twilioWebhookUrl("/api/twilio/incoming"),
      smsUrl: twilioWebhookUrl("/api/twilio/sms/incoming"),
      statusCallback: twilioWebhookUrl("/api/twilio/status"),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "buy_failed";
    return jsonError("number_buy_failed", 502, { detail: msg }, cors);
  }

  const row = {
    e164: provisioned.phoneNumber,
    friendly_name: provisioned.friendlyName,
    country: body.country,
    number_type: body.type,
    capabilities: provisioned.capabilities,
    provider: "twilio",
    twilio_sid: provisioned.sid,
    assigned_agent_id: body.assignedAgentId ?? null,
    status: "active",
    monthly_cost: body.monthlyCost ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("phone_numbers")
    .upsert(row, { onConflict: "e164" })
    .select("*")
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);

  return json({ number: data }, { headers: cors });
});
