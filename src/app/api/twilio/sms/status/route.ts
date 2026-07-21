/**
 * SMS delivery status callback. Updates the message row by its Twilio SID.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);
  if (!validateTwilioSignature(req, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getServiceClient();
  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;

  if (sid && status) {
    await db
      .from("sms_messages")
      .update({
        status,
        error_message: params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null,
      })
      .eq("twilio_sid", sid);
  }

  return new Response(null, { status: 204 });
}
