/**
 * Recording status callback. Stores the recording on its call once ready.
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
  const callSid = params.CallSid ?? "";
  const recordingUrl = params.RecordingUrl ?? null;
  const recordingSid = params.RecordingSid ?? null;

  if (callSid && recordingUrl) {
    await db
      .from("calls")
      .update({
        recording_url: recordingUrl,
        recording_sid: recordingSid,
        updated_at: new Date().toISOString(),
      })
      .eq("twilio_call_sid", callSid);
  }

  return new Response(null, { status: 204 });
}
