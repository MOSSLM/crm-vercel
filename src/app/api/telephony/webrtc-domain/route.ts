/**
 * WebRTC widget domain allow-listing.
 *
 * The in-browser widget only runs on domains registered with the provider
 * (my.zadarma.com is trusted by default; the CRM domain is not). This automates
 * the registration Zadarma otherwise requires in the panel.
 *
 * GET  : list registered domains.
 * POST : register a domain (send the CRM host).
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { telephonyWebrtcDomainSchema, type TelephonyWebrtcDomainPayload } from "@/app/api/_lib/schemas";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";

export const runtime = "nodejs";

export const GET = withAuth({}, async ({ cors }) => {
  if (!isTelephonyConfigured()) return json({ domains: [] }, { headers: cors });
  try {
    const domains = await getTelephonyProvider().listWebrtcDomains();
    return json({ domains }, { headers: cors });
  } catch {
    return json({ domains: [] }, { headers: cors });
  }
});

export const POST = withAuth<TelephonyWebrtcDomainPayload>(
  { role: "admin", body: telephonyWebrtcDomainSchema },
  async ({ body, cors }) => {
    if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503, {}, cors);
    const provider = getTelephonyProvider();
    if (!provider.supports("browserWebRTC")) {
      return jsonError("not_supported", 409, {}, cors);
    }
    // Normalise: strip scheme/path, keep the host.
    const domain = body.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    const res = await provider.registerWebrtcDomain(domain);
    if (!res.ok) return jsonError("register_failed", 502, { detail: res.detail }, cors);
    return json({ ok: true, domain }, { headers: cors });
  },
);
