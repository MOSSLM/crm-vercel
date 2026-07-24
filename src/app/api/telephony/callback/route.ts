/**
 * Click-to-call via the provider callback: the provider rings the agent's
 * number/extension first, then dials the customer and bridges them. No WebRTC —
 * works from any record with a phone number.
 *
 * Seeds an outbound `calls` row keyed by the returned provider call id so the
 * CRM links (contact / company / deal) are present before the webhooks arrive;
 * the webhook ingestion updates the same row idempotently.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { telephonyCallbackSchema, type TelephonyCallbackPayload } from "@/app/api/_lib/schemas";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";
import { resolveAgentExtension } from "@/app/api/telephony/_lib";
import { toE164 } from "@/lib/telephony/phone";

export const runtime = "nodejs";

export const POST = withAuth<TelephonyCallbackPayload>(
  { body: telephonyCallbackSchema },
  async ({ user, body, cors }) => {
    if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503, {}, cors);

    const sc = getServiceClient();
    const ext = await resolveAgentExtension(sc, user.id);
    const from = body.from ?? ext?.extension ?? ext?.sip ?? undefined;
    if (!from) {
      return jsonError("no_agent_number", 409, {
        detail:
          "Aucune extension SIP active n'est reliée à ton compte. Renseigne ton login SIP dans Réglages softphone (ex. 580453-100).",
      }, cors);
    }

    // A SIP trunk only routes international numbers; normalise the destination so
    // a French national number (06…) becomes +33… before it reaches the provider.
    const to = toE164(body.to);
    if (!to) return jsonError("invalid_number", 400, { detail: "Empty destination." }, cors);

    const provider = getTelephonyProvider();
    let providerCallId = "";
    try {
      const res = await provider.placeCallback({ from, to, ext: ext?.extension });
      providerCallId = res.providerCallId;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "provider_error";
      return jsonError("callback_failed", 502, { detail }, cors);
    }

    if (providerCallId) {
      await sc.from("calls").upsert(
        {
          provider: provider.id,
          provider_call_id: providerCallId,
          direction: "outbound",
          from_e164: from,
          to_e164: to,
          agent_id: user.id,
          contact_id: body.contact_id ?? null,
          entreprise_id: body.entreprise_id ?? null,
          opportunite_id: body.opportunite_id ?? null,
        },
        { onConflict: "provider,provider_call_id" },
      );
    }

    return json({ ok: true, providerCallId }, { headers: cors });
  },
);
