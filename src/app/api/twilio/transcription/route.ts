/**
 * Transcription callback (Twilio `transcribeCallback`). Stores the text against
 * the call and, when it matches a voicemail recording, on the voicemail too.
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
  const recordingSid = params.RecordingSid ?? null;
  const text = params.TranscriptionText ?? "";
  const status = params.TranscriptionStatus ?? "";

  if (status !== "completed" || !text) {
    return new Response(null, { status: 204 });
  }

  // Link to the call row and upsert the transcript.
  if (callSid) {
    const { data: call } = await db
      .from("calls")
      .select("id")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();
    const callId = (call as { id: string } | null)?.id;
    if (callId) {
      await db
        .from("call_transcripts")
        .upsert(
          { call_id: callId, provider: "twilio", text, created_at: new Date().toISOString() },
          { onConflict: "call_id" },
        );
    }
  }

  // Voicemail transcription.
  if (recordingSid) {
    await db.from("voicemails").update({ transcription: text }).eq("recording_sid", recordingSid);
  }

  return new Response(null, { status: 204 });
}
