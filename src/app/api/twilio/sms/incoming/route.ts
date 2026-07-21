/**
 * Inbound SMS/MMS webhook. Stores the message, links it to the receiving
 * number's agent and (best-effort) a known contact, and notifies the agent.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio/signature";
import { logSms } from "@/lib/twilio/sms-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });

export async function POST(req: Request) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);
  if (!validateTwilioSignature(req, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getServiceClient();
  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = params.Body ?? "";
  const sid = params.MessageSid ?? params.SmsSid ?? null;

  const numMedia = Number(params.NumMedia ?? "0");
  const media: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) media.push(url);
  }

  // Resolve the receiving number → agent, and match the sender to a contact.
  const { data: numRow } = await db
    .from("phone_numbers")
    .select("id, assigned_agent_id")
    .eq("e164", to)
    .maybeSingle();
  const number = numRow as { id: string; assigned_agent_id: string | null } | null;

  const { data: contactRow } = await db
    .from("contacts")
    .select("id, entreprise_id")
    .eq("tel", from)
    .maybeSingle();
  const contact = contactRow as { id: string; entreprise_id: number | null } | null;

  await logSms(db, {
    smsSid: sid,
    direction: "inbound",
    from,
    to,
    numberId: number?.id ?? null,
    agentId: number?.assigned_agent_id ?? null,
    contactId: contact?.id ?? null,
    entrepriseId: contact?.entreprise_id ?? null,
    body,
    media,
    status: "received",
  });

  if (number?.assigned_agent_id) {
    await db.from("notifications").insert({
      user_id: number.assigned_agent_id,
      type: "sms",
      title: "Nouveau SMS",
      status: "info",
      summary: { from, body: body.slice(0, 200) },
    });
  }

  return emptyTwiml();
}
