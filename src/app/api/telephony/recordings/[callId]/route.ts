/**
 * Serve a call recording for playback in the CRM.
 *
 * Authenticated (any staff/agent), then authorised per-call: admins hear any
 * call; an agent hears their own calls (or unassigned inbound). Returns a
 * short-lived URL — a signed Supabase Storage URL once the recording has been
 * pulled locally, otherwise a fresh provider link as a fallback.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";

export const runtime = "nodejs";

export const GET = withAuth<undefined, { callId: string }>({}, async ({ user, params, cors }) => {
  const sc = getServiceClient();

  const { data: call } = await sc
    .from("calls")
    .select("id, agent_id")
    .eq("id", params.callId)
    .maybeSingle();
  if (!call) return jsonError("not_found", 404, {}, cors);

  const { data: profile } = await sc
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";
  const isOwner = call.agent_id === user.id || call.agent_id == null;
  if (!isAdmin && !isOwner) return jsonError("forbidden", 403, {}, cors);

  const { data: rec } = await sc
    .from("call_recordings")
    .select("storage_path, provider_record_id")
    .eq("call_id", params.callId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rec) return jsonError("no_recording", 404, {}, cors);

  // Preferred: our own stored copy → signed URL.
  if (rec.storage_path) {
    const { data: signed } = await sc.storage
      .from("call-recordings")
      .createSignedUrl(rec.storage_path, 3600);
    if (signed?.signedUrl) {
      return json({ url: signed.signedUrl, source: "storage" }, { headers: cors });
    }
  }

  // Fallback: fetch a fresh (expiring) link from the provider.
  if (rec.provider_record_id && isTelephonyConfigured()) {
    try {
      const ref = await getTelephonyProvider().getRecording(rec.provider_record_id);
      return json({ url: ref.url, expiresAt: ref.expiresAt, source: "provider" }, { headers: cors });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "provider_error";
      return jsonError("recording_unavailable", 502, { detail }, cors);
    }
  }

  return jsonError("recording_unavailable", 409, {}, cors);
});
