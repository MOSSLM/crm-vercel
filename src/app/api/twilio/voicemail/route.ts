/**
 * Voicemail capture — the `action` of the `<Record>` verb. Stores the recording,
 * links it to the call, and notifies the assigned agent.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio/signature";
import { sayHangupTwiml } from "@/lib/twilio/inbound-twiml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const xml = (body: string): Response =>
  new Response(body, { status: 200, headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);
  if (!validateTwilioSignature(req, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getServiceClient();
  const url = new URL(req.url);
  const numberId = url.searchParams.get("numberId") || null;
  const agentId = url.searchParams.get("agentId") || null;
  const callSid = url.searchParams.get("callSid") || params.CallSid || "";

  const recordingUrl = params.RecordingUrl ?? null;
  const recordingSid = params.RecordingSid ?? null;
  const duration = params.RecordingDuration ? Number(params.RecordingDuration) : null;
  const from = params.From ?? null;

  // Resolve the call row (if any) to link the voicemail.
  const { data: call } = callSid
    ? await db.from("calls").select("id").eq("twilio_call_sid", callSid).maybeSingle()
    : { data: null };
  const callId = (call as { id: string } | null)?.id ?? null;

  await db.from("voicemails").insert({
    call_id: callId,
    call_sid: callSid || null,
    number_id: numberId,
    agent_id: agentId,
    from_e164: from,
    recording_url: recordingUrl,
    recording_sid: recordingSid,
    duration_seconds: Number.isNaN(duration as number) ? null : duration,
  });

  if (callId) {
    await db
      .from("calls")
      .update({
        voicemail_url: recordingUrl,
        disposition: "repondeur",
        updated_at: new Date().toISOString(),
      })
      .eq("id", callId);
  }

  if (agentId) {
    await db.from("notifications").insert({
      user_id: agentId,
      type: "voicemail",
      title: "Nouveau message vocal",
      status: "info",
      summary: { from, recording_url: recordingUrl, duration_seconds: duration },
    });
  }

  return xml(sayHangupTwiml("Merci, votre message a bien été enregistré. Au revoir."));
}
