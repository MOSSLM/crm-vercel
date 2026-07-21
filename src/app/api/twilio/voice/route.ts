/**
 * TwiML App Voice URL — hit by Twilio when the browser softphone places an
 * outbound call (`Device.connect({ params: { To, ... } })`). We resolve the
 * agent's caller ID server-side (never trust the client), record the call, and
 * return TwiML that bridges to the dialed PSTN number.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio/signature";
import { outboundDialTwiml, sayErrorTwiml } from "@/lib/twilio/twiml";
import { parseClientIdentity, resolveAgentCallerNumber } from "@/lib/twilio/call-routing";
import { upsertCall } from "@/lib/twilio/call-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const xml = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);

  if (!validateTwilioSignature(req, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const callSid = params.CallSid ?? "";
  const to = (params.To ?? "").trim();
  const agentId = parseClientIdentity(params.From);

  const db = getServiceClient();

  if (!agentId) {
    return xml(sayErrorTwiml("Appelant non identifié."));
  }
  if (!to) {
    return xml(sayErrorTwiml("Numéro de destination manquant."));
  }

  const caller = await resolveAgentCallerNumber(db, agentId);
  if (!caller) {
    return xml(
      sayErrorTwiml("Aucun numéro d'appel n'est configuré pour votre compte."),
    );
  }

  // Optional CRM linkage passed through from the softphone (Device.connect params).
  const contactId = params.contactId || null;
  const entrepriseIdRaw = params.entrepriseId;
  const entrepriseId = entrepriseIdRaw ? Number(entrepriseIdRaw) : null;
  const opportuniteId = params.opportuniteId || null;

  await upsertCall(db, {
    callSid,
    direction: "outbound",
    from: caller.e164,
    to,
    numberId: caller.numberId,
    agentId,
    contactId,
    entrepriseId: Number.isNaN(entrepriseId as number) ? null : entrepriseId,
    opportuniteId,
    status: "initiated",
  });

  return xml(outboundDialTwiml({ callerId: caller.e164, to }));
}
