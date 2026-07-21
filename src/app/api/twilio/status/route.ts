/**
 * Twilio call status callbacks (parent call lifecycle). Updates the call row,
 * journals each event, and finalizes CRM side effects on terminal statuses.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio/signature";
import { recordCallEvent, finalizeCall } from "@/lib/twilio/call-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);

  if (!validateTwilioSignature(req, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getServiceClient();
  const callSid = params.CallSid ?? "";
  const callStatus = params.CallStatus ?? "unknown";

  const { data: row } = await db
    .from("calls")
    .select("id")
    .eq("twilio_call_sid", callSid)
    .maybeSingle();
  const callId = (row as { id: string } | null)?.id ?? null;

  await recordCallEvent(db, { callId, callSid, event: callStatus, payload: params });

  if (callStatus === "in-progress") {
    await db
      .from("calls")
      .update({
        status: "in-progress",
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("twilio_call_sid", callSid);
  } else if (TERMINAL.has(callStatus)) {
    const durationRaw = params.CallDuration ?? params.DialCallDuration;
    const duration = durationRaw ? Number(durationRaw) : null;
    await finalizeCall(db, {
      callSid,
      status: callStatus,
      durationSeconds: Number.isNaN(duration as number) ? null : duration,
    });
  } else if (callSid) {
    await db
      .from("calls")
      .update({ status: callStatus, updated_at: new Date().toISOString() })
      .eq("twilio_call_sid", callSid);
  }

  return new Response(null, { status: 204 });
}
