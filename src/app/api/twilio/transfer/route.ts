/**
 * Cold-transfer the in-progress call to another number. Redirects the live call
 * via the Twilio REST API to a fresh <Dial>, disconnecting the current agent.
 */
import { z } from "zod";
import twilio from "twilio";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTwilioService } from "@/lib/twilio/service";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  callSid: z.string().min(4),
  to: z.string().min(3),
});

export const POST = withAuth({ role: STAFF_ROLES, body: bodySchema }, async ({ body, cors }) => {
  const to = body.to.replace(/[^\d+]/g, "");
  if (!to) return jsonError("invalid_target", 400, {}, cors);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  twiml.say({ language: "fr-FR", voice: "Polly.Lea" }, "Transfert de votre appel, veuillez patienter.");
  twiml.dial({ answerOnBridge: true }).number({}, to);

  try {
    await getTwilioService().updateCall(body.callSid, { twiml: twiml.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "transfer_failed";
    return jsonError("transfer_failed", 502, { detail: msg }, cors);
  }

  // Best-effort log of the transfer on the call row.
  const db = getServiceClient();
  await db
    .from("calls")
    .update({ disposition: "transfere", updated_at: new Date().toISOString() })
    .eq("twilio_call_sid", body.callSid);

  return json({ ok: true }, { headers: cors });
});
