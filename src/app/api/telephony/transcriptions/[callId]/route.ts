/**
 * Call transcription — trigger (POST) and fetch/poll (GET).
 *
 * Transcription is billed per minute, so it is on-demand (never automatic).
 * Provider access stays behind startTranscription/getTranscription.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";
import { loadAccessibleCall } from "@/app/api/telephony/_lib";

export const runtime = "nodejs";

export const POST = withAuth<undefined, { callId: string }>({}, async ({ user, params, cors }) => {
  if (!isTelephonyConfigured()) return jsonError("telephony_not_configured", 503, {}, cors);
  const provider = getTelephonyProvider();
  if (!provider.supports("transcription")) {
    return jsonError("not_supported", 409, { detail: "Provider has no transcription." }, cors);
  }

  const sc = getServiceClient();
  const { call, allowed } = await loadAccessibleCall(
    sc,
    user.id,
    params.callId,
    "id, agent_id, provider_call_id, recording_provider_id",
  );
  if (!call) return jsonError("not_found", 404, {}, cors);
  if (!allowed) return jsonError("forbidden", 403, {}, cors);

  const { data: rec } = await sc
    .from("call_recordings")
    .select("provider_record_id")
    .eq("call_id", call.id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recordingProviderId =
    (rec?.provider_record_id as string | undefined) ??
    (call.recording_provider_id as string | undefined);

  let jobId = "";
  try {
    const res = await provider.startTranscription({
      providerCallId: call.provider_call_id as string,
      recordingProviderId,
    });
    jobId = res.jobId;
  } catch (e) {
    const detail = e instanceof Error ? e.message : "provider_error";
    return jsonError("transcription_failed", 502, { detail }, cors);
  }

  const { data: existing } = await sc
    .from("call_transcripts")
    .select("id")
    .eq("call_id", call.id as string)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await sc
      .from("call_transcripts")
      .update({ job_id: jobId, status: "pending", provider: provider.id })
      .eq("id", existing.id);
  } else {
    await sc
      .from("call_transcripts")
      .insert({ call_id: call.id, provider: provider.id, job_id: jobId, status: "pending" });
  }
  await sc.from("calls").update({ transcript_status: "pending" }).eq("id", call.id as string);

  return json({ ok: true, jobId, status: "pending" }, { headers: cors });
});

export const GET = withAuth<undefined, { callId: string }>({}, async ({ user, params, cors }) => {
  const sc = getServiceClient();
  const { call, allowed } = await loadAccessibleCall(sc, user.id, params.callId);
  if (!call) return jsonError("not_found", 404, {}, cors);
  if (!allowed) return jsonError("forbidden", 403, {}, cors);

  const { data: tr } = await sc
    .from("call_transcripts")
    .select("id, job_id, status, lang, full_text, phrases")
    .eq("call_id", call.id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tr) return json({ status: "none" }, { headers: cors });

  if (tr.status === "done") {
    return json(
      { status: "done", full_text: tr.full_text, phrases: tr.phrases, lang: tr.lang },
      { headers: cors },
    );
  }

  // Poll the provider for a result.
  if (isTelephonyConfigured() && tr.job_id) {
    try {
      const result = await getTelephonyProvider().getTranscription(tr.job_id as string);
      if (result.status === "done") {
        const fullText =
          result.fullText ?? (result.phrases?.map((p) => p.phrase).join(" ") ?? "");
        await sc
          .from("call_transcripts")
          .update({
            status: "done",
            lang: result.lang,
            phrases: result.phrases,
            words: result.words,
            full_text: fullText,
          })
          .eq("id", tr.id);
        await sc.from("calls").update({ transcript_status: "done" }).eq("id", call.id as string);
        return json(
          { status: "done", full_text: fullText, phrases: result.phrases, lang: result.lang },
          { headers: cors },
        );
      }
    } catch {
      // fall through to reporting the stored (pending) status
    }
  }

  return json({ status: (tr.status as string) ?? "pending" }, { headers: cors });
});
