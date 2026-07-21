/**
 * Inbound call handler — hit by Twilio when a call reaches one of our numbers.
 *
 * Stages (via ?stage=):
 *   (initial)     resolve the number → route: IVR menu, ring agent(s), forward,
 *                 or voicemail depending on On/Off mode and settings.
 *   after-dial    the ring finished; if unanswered, drop to voicemail.
 *   menu          an IVR digit was pressed; route accordingly.
 *
 * Everything degrades safely: an unknown number or no available agent goes to
 * voicemail rather than failing the call.
 */
import { getServiceClient } from "@/app/api/_lib/service-client";
import { parseTwilioForm, validateTwilioSignature } from "@/lib/twilio/signature";
import { twilioWebhookUrl } from "@/lib/twilio/config";
import { clientIdentityForUser } from "@/lib/twilio/token";
import { upsertCall } from "@/lib/twilio/call-logging";
import {
  dialClientsTwiml,
  forwardTwiml,
  voicemailTwiml,
  gatherMenuTwiml,
  sayHangupTwiml,
} from "@/lib/twilio/inbound-twiml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof getServiceClient>;

const xml = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "Content-Type": "text/xml" } });

const vmUrl = (numberId: string | null, agentId: string | null, callSid: string) =>
  twilioWebhookUrl(
    `/api/twilio/voicemail?numberId=${numberId ?? ""}&agentId=${agentId ?? ""}&callSid=${encodeURIComponent(callSid)}`,
  );

/** Best-effort: link the caller's number to a known contact. */
const findContactByPhone = async (db: Db, from: string): Promise<string | null> => {
  if (!from) return null;
  const { data } = await db.from("contacts").select("id").eq("tel", from).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
};

interface AgentSettings {
  mode: "on" | "off";
  forward_to_e164: string | null;
  voicemail_greeting_tts: string | null;
  recording_enabled: boolean;
}

const getSettings = async (db: Db, agentId: string): Promise<AgentSettings | null> => {
  const { data } = await db
    .from("agent_phone_settings")
    .select("mode, forward_to_e164, voicemail_greeting_tts, recording_enabled")
    .eq("user_id", agentId)
    .maybeSingle();
  return (data as AgentSettings | null) ?? null;
};

const RECORDING_CB = () => twilioWebhookUrl("/api/twilio/recording");
const TRANSCRIBE_CB = () => twilioWebhookUrl("/api/twilio/transcription");

/** Identities of agents currently On (fallback ring when no assigned agent). */
const onlineAgentIdentities = async (db: Db): Promise<string[]> => {
  const { data } = await db
    .from("agent_phone_settings")
    .select("user_id")
    .eq("mode", "on");
  return ((data as { user_id: string }[] | null) ?? []).map((r) => clientIdentityForUser(r.user_id));
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  const params = parseTwilioForm(rawBody);
  if (!validateTwilioSignature(req, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getServiceClient();
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  const callSid = params.CallSid ?? "";
  const from = params.From ?? "";
  const to = params.To ?? params.Called ?? "";

  // Resolve which of our numbers was called.
  const { data: numRow } = await db
    .from("phone_numbers")
    .select("id, assigned_agent_id, friendly_name")
    .eq("e164", to)
    .maybeSingle();
  const number = numRow as { id: string; assigned_agent_id: string | null } | null;
  const numberId = number?.id ?? null;
  const assignedAgentId = number?.assigned_agent_id ?? null;

  // --- Stage: after a ring that no one answered → voicemail ---------------
  if (stage === "after-dial") {
    const dialStatus = params.DialCallStatus;
    if (dialStatus === "completed" || dialStatus === "answered") {
      return xml(sayHangupTwiml("Merci, à bientôt.")); // call already handled
    }
    const settings = assignedAgentId ? await getSettings(db, assignedAgentId) : null;
    return xml(
      voicemailTwiml({
        greeting: settings?.voicemail_greeting_tts ?? undefined,
        actionUrl: vmUrl(numberId, assignedAgentId, callSid),
        transcribeCallback: TRANSCRIBE_CB(),
      }),
    );
  }

  // --- Stage: an IVR digit was pressed ------------------------------------
  if (stage === "menu") {
    const digit = params.Digits;
    const { data: ivr } = numberId
      ? await db.from("ivr_flows").select("config").eq("number_id", numberId).maybeSingle()
      : { data: null };
    const config = (ivr as { config?: Record<string, unknown> } | null)?.config ?? {};
    const menu = (config.menu as Array<{ digit: string; action: string; target?: string }>) ?? [];
    const choice = menu.find((m) => m.digit === digit);

    if (choice?.action === "forward" && choice.target) {
      return xml(
        forwardTwiml({
          to: choice.target,
          callerId: to,
          actionUrl: twilioWebhookUrl("/api/twilio/incoming?stage=after-dial"),
        }),
      );
    }
    if (choice?.action === "agent" && choice.target) {
      return xml(
        dialClientsTwiml({
          identities: [clientIdentityForUser(choice.target)],
          callerId: to,
          actionUrl: twilioWebhookUrl(
            `/api/twilio/incoming?stage=after-dial&agentId=${choice.target}`,
          ),
        }),
      );
    }
    // Default / "voicemail" choice.
    return xml(
      voicemailTwiml({
        actionUrl: vmUrl(numberId, assignedAgentId, callSid),
        transcribeCallback: TRANSCRIBE_CB(),
      }),
    );
  }

  // --- Initial: log the inbound call, then route --------------------------
  const contactId = await findContactByPhone(db, from);
  await upsertCall(db, {
    callSid,
    direction: "inbound",
    from,
    to,
    numberId,
    agentId: assignedAgentId,
    contactId,
    status: "ringing",
  });

  if (!number) {
    return xml(sayHangupTwiml("Ce numéro n'est pas attribué. Au revoir."));
  }

  // IVR menu takes precedence when configured.
  if (numberId) {
    const { data: ivr } = await db
      .from("ivr_flows")
      .select("enabled, config")
      .eq("number_id", numberId)
      .maybeSingle();
    const flow = ivr as { enabled: boolean; config: Record<string, unknown> } | null;
    if (flow?.enabled && Array.isArray(flow.config.menu) && flow.config.menu.length > 0) {
      return xml(
        gatherMenuTwiml({
          greeting:
            (flow.config.greeting as string) ??
            "Bonjour, merci de composer un chiffre pour être mis en relation.",
          actionUrl: twilioWebhookUrl("/api/twilio/incoming?stage=menu"),
        }),
      );
    }
  }

  // Assigned agent: honour their On/Off mode.
  if (assignedAgentId) {
    const settings = await getSettings(db, assignedAgentId);
    const mode = settings?.mode ?? "on";
    const record = settings?.recording_enabled ?? false;
    if (mode === "on") {
      return xml(
        dialClientsTwiml({
          identities: [clientIdentityForUser(assignedAgentId)],
          callerId: to,
          actionUrl: twilioWebhookUrl(
            `/api/twilio/incoming?stage=after-dial&agentId=${assignedAgentId}`,
          ),
          record,
          consent: record,
          recordingStatusCallback: record ? RECORDING_CB() : undefined,
        }),
      );
    }
    // Off: forward if configured, else voicemail.
    if (settings?.forward_to_e164) {
      return xml(
        forwardTwiml({
          to: settings.forward_to_e164,
          callerId: to,
          actionUrl: twilioWebhookUrl("/api/twilio/incoming?stage=after-dial"),
          record,
          consent: record,
          recordingStatusCallback: record ? RECORDING_CB() : undefined,
        }),
      );
    }
    return xml(
      voicemailTwiml({
        greeting: settings?.voicemail_greeting_tts ?? undefined,
        actionUrl: vmUrl(numberId, assignedAgentId, callSid),
        transcribeCallback: TRANSCRIBE_CB(),
      }),
    );
  }

  // No assigned agent: ring everyone who is On, else voicemail.
  const identities = await onlineAgentIdentities(db);
  if (identities.length > 0) {
    return xml(
      dialClientsTwiml({
        identities,
        callerId: to,
        actionUrl: twilioWebhookUrl("/api/twilio/incoming?stage=after-dial"),
      }),
    );
  }

  return xml(
    voicemailTwiml({ actionUrl: vmUrl(numberId, null, callSid), transcribeCallback: TRANSCRIBE_CB() }),
  );
}
