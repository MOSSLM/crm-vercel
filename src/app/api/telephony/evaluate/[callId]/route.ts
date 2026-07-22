/**
 * AI call evaluation — score a call from its transcript (POST) and fetch the
 * latest evaluation (GET). Requires a completed transcript.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { loadAccessibleCall } from "@/app/api/telephony/_lib";
import { evaluateCallTranscript } from "@/lib/telephony/ai";

export const runtime = "nodejs";

export const POST = withAuth<undefined, { callId: string }>({}, async ({ user, params, cors }) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ai_not_configured", 503, {}, cors);
  }

  const sc = getServiceClient();
  const { call, allowed } = await loadAccessibleCall(
    sc,
    user.id,
    params.callId,
    "id, agent_id, direction",
  );
  if (!call) return jsonError("not_found", 404, {}, cors);
  if (!allowed) return jsonError("forbidden", 403, {}, cors);

  const { data: tr } = await sc
    .from("call_transcripts")
    .select("full_text")
    .eq("call_id", call.id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const transcript = tr?.full_text as string | undefined;
  if (!transcript) {
    return jsonError("no_transcript", 409, { detail: "Transcris l'appel d'abord." }, cors);
  }

  let evaluation;
  try {
    evaluation = await evaluateCallTranscript({
      transcript,
      direction: call.direction as string | undefined,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "ai_error";
    return jsonError("evaluation_failed", 502, { detail }, cors);
  }

  await sc.from("call_evaluations").insert({
    call_id: call.id,
    model: evaluation.model,
    score: evaluation.score,
    criteria: evaluation.criteria,
    summary: evaluation.summary,
    sentiment: evaluation.sentiment,
    created_by: "anthropic",
  });
  await sc.from("calls").update({ evaluation_status: "done" }).eq("id", call.id as string);

  return json({ ok: true, evaluation }, { headers: cors });
});

export const GET = withAuth<undefined, { callId: string }>({}, async ({ user, params, cors }) => {
  const sc = getServiceClient();
  const { call, allowed } = await loadAccessibleCall(sc, user.id, params.callId);
  if (!call) return jsonError("not_found", 404, {}, cors);
  if (!allowed) return jsonError("forbidden", 403, {}, cors);

  const { data: evaluation } = await sc
    .from("call_evaluations")
    .select("score, criteria, sentiment, summary, model, created_at")
    .eq("call_id", call.id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({ evaluation: evaluation ?? null }, { headers: cors });
});
