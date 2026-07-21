/**
 * Run the AI evaluation on a call's transcript. Accepts an inline transcript
 * (stored as provider='manual') or uses the stored one. Admins any call; agents
 * their own. 503 when no LLM key is configured.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { evaluateCallTranscript, isAiConfigured } from "@/lib/twilio/ai-evaluate";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type Db = ReturnType<typeof getServiceClient>;

const canAccess = async (db: Db, userId: string, callId: string): Promise<boolean> => {
  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role === "admin") return true;
  const { data } = await db.from("calls").select("agent_id").eq("id", callId).maybeSingle();
  return (data as { agent_id: string | null } | null)?.agent_id === userId;
};

const bodySchema = z.object({ transcript: z.string().optional() });

export const POST = withAuth<z.infer<typeof bodySchema>, { id: string }>(
  { role: STAFF_ROLES, body: bodySchema },
  async ({ user, body, params, cors }) => {
    if (!isAiConfigured()) return jsonError("ai_not_configured", 503, {}, cors);

    const db = getServiceClient();
    if (!(await canAccess(db, user.id, params.id))) {
      return jsonError("forbidden", 403, {}, cors);
    }

    // Resolve the transcript: inline (stored) or previously captured.
    let transcript = body.transcript?.trim() ?? "";
    if (transcript) {
      await db
        .from("call_transcripts")
        .upsert(
          { call_id: params.id, provider: "manual", text: transcript, created_at: new Date().toISOString() },
          { onConflict: "call_id" },
        );
    } else {
      const { data } = await db
        .from("call_transcripts")
        .select("text")
        .eq("call_id", params.id)
        .maybeSingle();
      transcript = (data as { text: string } | null)?.text ?? "";
    }

    if (!transcript) return jsonError("no_transcript", 400, {}, cors);

    let evaluation;
    try {
      evaluation = await evaluateCallTranscript(transcript);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "eval_failed";
      return jsonError("ai_eval_failed", 502, { detail: msg }, cors);
    }

    const { data, error } = await db
      .from("call_ai_evaluations")
      .upsert(
        {
          call_id: params.id,
          summary: evaluation.summary,
          sentiment: evaluation.sentiment,
          score: evaluation.score,
          objections: evaluation.objections,
          next_action: evaluation.nextAction,
          topics: evaluation.topics,
          model: "claude-haiku-4-5-20251001",
          created_at: new Date().toISOString(),
        },
        { onConflict: "call_id" },
      )
      .select("*")
      .maybeSingle();
    if (error) return jsonError(error.message, 500, {}, cors);

    return json({ evaluation: data }, { headers: cors });
  },
);
