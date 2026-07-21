/**
 * Call logging — the single writer for the `calls` table plus the CRM-visible
 * side effects a finished call produces:
 *   - activity_log (activity_type='appel')  → feeds KPI counters/objectives
 *   - email_logs   (channel='call')         → shows in the contact timeline UI
 *
 * Used by both the Twilio status webhook (real calls) and the mock-call endpoint
 * (simulation), so logging behaves identically in both modes.
 */
import type { getServiceClient } from "@/app/api/_lib/service-client";

type Db = ReturnType<typeof getServiceClient>;

export type CallDirection = "inbound" | "outbound";

export interface UpsertCallInput {
  callSid: string;
  direction: CallDirection;
  from?: string | null;
  to?: string | null;
  numberId?: string | null;
  agentId?: string | null;
  contactId?: string | null;
  entrepriseId?: number | null;
  opportuniteId?: string | null;
  status?: string;
  startedAt?: string;
}

/** Insert (or update) the call row keyed by the Twilio Call SID. Returns its id. */
export const upsertCall = async (db: Db, input: UpsertCallInput): Promise<string | null> => {
  const row = {
    twilio_call_sid: input.callSid,
    direction: input.direction,
    from_e164: input.from ?? null,
    to_e164: input.to ?? null,
    number_id: input.numberId ?? null,
    agent_id: input.agentId ?? null,
    contact_id: input.contactId ?? null,
    entreprise_id: input.entrepriseId ?? null,
    opportunite_id: input.opportuniteId ?? null,
    status: input.status ?? "initiated",
    started_at: input.startedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from("calls")
    .upsert(row, { onConflict: "twilio_call_sid" })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[twilio] upsertCall failed:", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
};

export interface RecordEventInput {
  callId?: string | null;
  callSid: string;
  event: string;
  payload?: Record<string, unknown>;
}

export const recordCallEvent = async (db: Db, input: RecordEventInput): Promise<void> => {
  await db.from("call_events").insert({
    call_id: input.callId ?? null,
    call_sid: input.callSid,
    event: input.event,
    payload: input.payload ?? {},
  });
};

export interface FinalizeCallInput {
  callSid: string;
  status: string; // e.g. 'completed', 'no-answer', 'busy', 'failed', 'canceled'
  durationSeconds?: number | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  recordingUrl?: string | null;
  disposition?: string | null;
}

const FR = (n: number) => Math.max(0, Math.round(n));

/**
 * Mark a call finished and emit its CRM side effects exactly once (idempotent
 * against repeated 'completed' webhooks).
 */
export const finalizeCall = async (db: Db, input: FinalizeCallInput): Promise<void> => {
  const { data: existing } = await db
    .from("calls")
    .select(
      "id, ended_at, direction, from_e164, to_e164, agent_id, contact_id, entreprise_id, opportunite_id, metadata",
    )
    .eq("twilio_call_sid", input.callSid)
    .maybeSingle();

  const call = existing as
    | {
        id: string;
        ended_at: string | null;
        direction: CallDirection;
        from_e164: string | null;
        to_e164: string | null;
        agent_id: string | null;
        contact_id: string | null;
        entreprise_id: number | null;
        opportunite_id: string | null;
      }
    | null;

  const endedAt = input.endedAt ?? new Date().toISOString();

  await db
    .from("calls")
    .update({
      status: input.status,
      ended_at: endedAt,
      answered_at: input.answeredAt ?? undefined,
      duration_seconds: input.durationSeconds == null ? undefined : FR(input.durationSeconds),
      recording_url: input.recordingUrl ?? undefined,
      disposition: input.disposition ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("twilio_call_sid", input.callSid);

  // Side effects only once: skip if the call was already finalized.
  if (!call || call.ended_at) return;

  const duration = input.durationSeconds == null ? null : FR(input.durationSeconds);
  const dirLabel = call.direction === "inbound" ? "entrant" : "sortant";
  const counterpart = call.direction === "inbound" ? call.from_e164 : call.to_e164;
  const title = `Appel ${dirLabel}${counterpart ? ` — ${counterpart}` : ""}`;
  const durationText = duration != null ? ` (${duration}s)` : "";

  // KPI journal — counts toward Objectives.calls.
  await db.from("activity_log").insert({
    owner_id: call.agent_id,
    activity_type: "appel",
    status: "faite",
    title,
    description: `Statut: ${input.status}${durationText}`,
    opportunite_id: call.opportunite_id,
    entreprise_id: call.entreprise_id,
    metadata: {
      call_sid: input.callSid,
      direction: call.direction,
      duration_seconds: duration,
      from: call.from_e164,
      to: call.to_e164,
      status: input.status,
    },
  });

  // Contact timeline — surfaced by the existing multi-channel EmailHistory UI.
  if (call.contact_id || call.entreprise_id || call.opportunite_id) {
    await db.from("email_logs").insert({
      channel: "call",
      contact_id: call.contact_id,
      entreprise_id: call.entreprise_id,
      opportunite_id: call.opportunite_id,
      to_email: counterpart ?? "—",
      subject: title,
      body_text: `Appel ${dirLabel} — statut ${input.status}${durationText}`,
      status: input.status === "completed" ? "sent" : "failed",
      sent_at: endedAt,
    });
  }
};
