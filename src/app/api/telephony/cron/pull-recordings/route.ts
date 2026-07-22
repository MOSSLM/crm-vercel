/**
 * Cron: pull call recordings from the provider into our own Supabase Storage
 * before the provider's temporary links expire (retention is short and quotas
 * are small). Marks `calls.recording_status = 'stored'` once local.
 *
 * Auth mirrors the other cron routes: Vercel `Authorization: Bearer CRON_SECRET`
 * or Supabase pg_cron `x-pg-cron-secret`.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTelephonyProvider, isTelephonyConfigured } from "@/lib/telephony/factory";

export const runtime = "nodejs";

const BUCKET = "call-recordings";
const BATCH = 20;

const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const pgCronSecret = process.env.PG_CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret && !pgCronSecret) return false;
  if (!cronSecret && !pgCronSecret) return true;
  const auth = req.headers.get("authorization");
  const pgHeader = req.headers.get("x-pg-cron-secret");
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret;
  return validVercel || validPgCron;
};

export async function GET(req: Request) {
  if (!verifyCron(req)) return jsonError("Unauthorized", 401);
  if (!isTelephonyConfigured()) return json({ processed: 0, skipped: "not_configured" });

  const sc = getServiceClient();
  const provider = getTelephonyProvider();

  const { data: pending, error } = await sc
    .from("call_recordings")
    .select("id, call_id, provider_record_id")
    .is("storage_path", null)
    .not("provider_record_id", "is", null)
    .limit(BATCH);
  if (error) return jsonError(error.message, 500);
  if (!pending || pending.length === 0) return json({ processed: 0 });

  let processed = 0;
  const errors: string[] = [];

  for (const rec of pending) {
    try {
      const ref = await provider.getRecording(rec.provider_record_id as string);
      const resp = await fetch(ref.url);
      if (!resp.ok) throw new Error(`download_${resp.status}`);
      const bytes = Buffer.from(await resp.arrayBuffer());
      const path = `${rec.call_id}/${rec.provider_record_id}.mp3`;

      const { error: upErr } = await sc.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (upErr) throw new Error(`upload_${upErr.message}`);

      await sc
        .from("call_recordings")
        .update({
          storage_path: path,
          source_url: ref.url,
          source_expires_at: ref.expiresAt,
          bytes: bytes.length,
        })
        .eq("id", rec.id);
      await sc.from("calls").update({ recording_status: "stored" }).eq("id", rec.call_id);

      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      errors.push(`[${rec.id}] ${msg}`);
      await sc.from("calls").update({ recording_status: "failed" }).eq("id", rec.call_id);
    }
  }

  return json({ processed, ...(errors.length > 0 ? { errors } : {}) });
}
