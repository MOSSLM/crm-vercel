/**
 * Per-agent phone settings (On/Off mode, default caller number, forwarding,
 * recording, schedule). An agent manages their own row; an admin may target any
 * user via `?userId=` (GET) or `userId` (PUT).
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

const isAdmin = async (db: Db, userId: string): Promise<boolean> => {
  const { data } = await db.from("user_profiles").select("role").eq("id", userId).maybeSingle();
  return (data as { role?: string } | null)?.role === "admin";
};

const DEFAULT_SETTINGS = {
  mode: "on",
  default_number_id: null,
  forward_to_e164: null,
  voicemail_greeting_tts: null,
  recording_enabled: true,
  whisper_opt_in: false,
  schedule: {},
};

export const GET = withAuth({ role: STAFF_ROLES }, async ({ user, req, cors }) => {
  const db = getServiceClient();
  const url = new URL(req.url);
  const target = url.searchParams.get("userId") ?? user.id;

  if (target !== user.id && !(await isAdmin(db, user.id))) {
    return jsonError("forbidden", 403, {}, cors);
  }

  const [{ data: settings }, { data: numbers }] = await Promise.all([
    db.from("agent_phone_settings").select("*").eq("user_id", target).maybeSingle(),
    db
      .from("phone_numbers")
      .select("id, e164, friendly_name")
      .eq("assigned_agent_id", target)
      .eq("status", "active"),
  ]);

  return json(
    { settings: settings ?? { user_id: target, ...DEFAULT_SETTINGS }, numbers: numbers ?? [] },
    { headers: cors },
  );
});

const putSchema = z.object({
  userId: z.string().uuid().optional(),
  mode: z.enum(["on", "off"]).optional(),
  defaultNumberId: z.string().uuid().nullable().optional(),
  forwardToE164: z.string().nullable().optional(),
  voicemailGreetingTts: z.string().nullable().optional(),
  recordingEnabled: z.boolean().optional(),
  whisperOptIn: z.boolean().optional(),
  schedule: z.record(z.string(), z.unknown()).optional(),
});

export const PUT = withAuth({ role: STAFF_ROLES, body: putSchema }, async ({ user, body, cors }) => {
  const db = getServiceClient();
  const target = body.userId ?? user.id;

  if (target !== user.id && !(await isAdmin(db, user.id))) {
    return jsonError("forbidden", 403, {}, cors);
  }

  const patch: Record<string, unknown> = { user_id: target, updated_at: new Date().toISOString() };
  if (body.mode !== undefined) patch.mode = body.mode;
  if (body.defaultNumberId !== undefined) patch.default_number_id = body.defaultNumberId;
  if (body.forwardToE164 !== undefined) patch.forward_to_e164 = body.forwardToE164;
  if (body.voicemailGreetingTts !== undefined) patch.voicemail_greeting_tts = body.voicemailGreetingTts;
  if (body.recordingEnabled !== undefined) patch.recording_enabled = body.recordingEnabled;
  if (body.whisperOptIn !== undefined) patch.whisper_opt_in = body.whisperOptIn;
  if (body.schedule !== undefined) patch.schedule = body.schedule;

  const { data, error } = await db
    .from("agent_phone_settings")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ settings: data }, { headers: cors });
});
