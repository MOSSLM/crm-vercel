/**
 * Voicemail inbox. Admins see all; agents see their own. PATCH marks one as
 * listened.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: STAFF_ROLES }, async ({ user, cors }) => {
  const db = getServiceClient();
  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  let query = db
    .from("voicemails")
    .select("id, call_id, from_e164, recording_url, duration_seconds, transcription, listened, agent_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!isAdmin) query = query.eq("agent_id", user.id);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ voicemails: data ?? [] }, { headers: cors });
});

const patchSchema = z.object({ id: z.string().uuid(), listened: z.boolean() });

export const PATCH = withAuth({ role: STAFF_ROLES, body: patchSchema }, async ({ user, body, cors }) => {
  const db = getServiceClient();
  const { data: profile } = await db
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  let query = db.from("voicemails").update({ listened: body.listened }).eq("id", body.id);
  if (!isAdmin) query = query.eq("agent_id", user.id);
  const { error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true }, { headers: cors });
});
