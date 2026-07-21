/**
 * Single call detail (recording, transcript, AI evaluation) and mutation of its
 * CRM metadata (tags, disposition, notes). Admins any call; agents their own.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type Db = ReturnType<typeof getServiceClient>;

/** Loads the call if the caller may see it, else null. */
const loadOwnedCall = async (db: Db, userId: string, callId: string) => {
  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  const { data } = await db.from("calls").select("*").eq("id", callId).maybeSingle();
  const call = data as { id: string; agent_id: string | null } | null;
  if (!call) return { call: null, isAdmin };
  if (!isAdmin && call.agent_id !== userId) return { call: null, isAdmin, forbidden: true };
  return { call, isAdmin };
};

export const GET = withAuth<undefined, { id: string }>(
  { role: STAFF_ROLES },
  async ({ user, params, cors }) => {
    const db = getServiceClient();
    const { call, forbidden } = await loadOwnedCall(db, user.id, params.id);
    if (forbidden) return jsonError("forbidden", 403, {}, cors);
    if (!call) return jsonError("not_found", 404, {}, cors);

    const [{ data: transcript }, { data: evaluation }, { data: voicemail }] = await Promise.all([
      db.from("call_transcripts").select("*").eq("call_id", params.id).maybeSingle(),
      db.from("call_ai_evaluations").select("*").eq("call_id", params.id).maybeSingle(),
      db.from("voicemails").select("recording_url, transcription").eq("call_id", params.id).maybeSingle(),
    ]);

    return json({ call, transcript, evaluation, voicemail }, { headers: cors });
  },
);

const patchSchema = z.object({
  tags: z.array(z.string()).max(25).optional(),
  disposition: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = withAuth<z.infer<typeof patchSchema>, { id: string }>(
  { role: STAFF_ROLES, body: patchSchema },
  async ({ user, body, params, cors }) => {
    const db = getServiceClient();
    const { call, forbidden } = await loadOwnedCall(db, user.id, params.id);
    if (forbidden) return jsonError("forbidden", 403, {}, cors);
    if (!call) return jsonError("not_found", 404, {}, cors);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.disposition !== undefined) patch.disposition = body.disposition;
    if (body.notes !== undefined) patch.notes = body.notes;

    const { data, error } = await db
      .from("calls")
      .update(patch)
      .eq("id", params.id)
      .select("id, tags, disposition, notes")
      .maybeSingle();
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ call: data }, { headers: cors });
  },
);
