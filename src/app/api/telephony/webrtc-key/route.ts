/**
 * Mint a short-lived key for the in-browser softphone (WebRTC widget).
 *
 * The key is always minted server-side (API secret never reaches the browser)
 * and scoped to the caller's assigned SIP extension. Zadarma keys live 72h; the
 * client re-mints before expiry.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";
import { resolveAgentExtension } from "@/app/api/telephony/_lib";

export const runtime = "nodejs";

export const GET = withAuth({}, async ({ user, cors }) => {
  if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503, {}, cors);

  const provider = getTelephonyProvider();
  if (!provider.supports("browserWebRTC")) {
    return jsonError("not_supported", 409, { detail: "Provider has no browser softphone." }, cors);
  }

  const sc = getServiceClient();
  const ext = await resolveAgentExtension(sc, user.id);
  const sip = ext?.sip ?? ext?.extension;
  if (!ext || !sip) {
    return jsonError("no_extension", 409, {
      detail: "No SIP extension assigned to this agent.",
    }, cors);
  }

  try {
    const key = await provider.mintBrowserKey({ ext: ext.extension, sip });
    return json(key, { headers: cors });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "provider_error";
    return jsonError("webrtc_key_failed", 502, { detail }, cors);
  }
});
