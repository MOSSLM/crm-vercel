/**
 * SMS logging — writes the `sms_messages` row and mirrors it to the contact
 * timeline (email_logs channel='sms'), so texts show alongside emails/calls.
 */
import type { getServiceClient } from "@/app/api/_lib/service-client";

type Db = ReturnType<typeof getServiceClient>;

export interface LogSmsInput {
  smsSid?: string | null;
  direction: "inbound" | "outbound";
  from?: string | null;
  to?: string | null;
  numberId?: string | null;
  agentId?: string | null;
  contactId?: string | null;
  entrepriseId?: number | null;
  body: string;
  media?: string[];
  status?: string;
  errorMessage?: string | null;
}

export const logSms = async (db: Db, input: LogSmsInput): Promise<string | null> => {
  const { data, error } = await db
    .from("sms_messages")
    .insert({
      twilio_sid: input.smsSid ?? null,
      direction: input.direction,
      from_e164: input.from ?? null,
      to_e164: input.to ?? null,
      number_id: input.numberId ?? null,
      agent_id: input.agentId ?? null,
      contact_id: input.contactId ?? null,
      entreprise_id: input.entrepriseId ?? null,
      body: input.body,
      media: input.media ?? [],
      status: input.status ?? "queued",
      error_message: input.errorMessage ?? null,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[twilio] logSms failed:", error.message);
    return null;
  }

  // Mirror to the contact timeline when we know who it concerns.
  if (input.contactId || input.entrepriseId) {
    const counterpart = input.direction === "inbound" ? input.from : input.to;
    await db.from("email_logs").insert({
      channel: "sms",
      contact_id: input.contactId ?? null,
      entreprise_id: input.entrepriseId ?? null,
      to_email: counterpart ?? "—",
      subject: `SMS ${input.direction === "inbound" ? "reçu" : "envoyé"}`,
      body_text: input.body,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  }

  return (data as { id: string } | null)?.id ?? null;
};
