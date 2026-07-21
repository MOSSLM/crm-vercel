/**
 * Update (assign / rename) or release a provisioned number (admin only).
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { getTwilioService } from "@/lib/twilio/service";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const patchSchema = z.object({
  assignedAgentId: z.string().uuid().nullable().optional(),
  friendlyName: z.string().optional(),
  status: z.enum(["active", "released", "porting"]).optional(),
});

export const PATCH = withAuth<z.infer<typeof patchSchema>, { id: string }>(
  { role: "admin", body: patchSchema },
  async ({ body, params, cors }) => {
    const db = getServiceClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.assignedAgentId !== undefined) patch.assigned_agent_id = body.assignedAgentId;
    if (body.friendlyName !== undefined) patch.friendly_name = body.friendlyName;
    if (body.status !== undefined) patch.status = body.status;

    const { data, error } = await db
      .from("phone_numbers")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .maybeSingle();
    if (error) return jsonError(error.message, 500, {}, cors);
    if (!data) return jsonError("not_found", 404, {}, cors);
    return json({ number: data }, { headers: cors });
  },
);

export const DELETE = withAuth<undefined, { id: string }>(
  { role: "admin" },
  async ({ params, cors }) => {
    const db = getServiceClient();
    const { data: num } = await db
      .from("phone_numbers")
      .select("twilio_sid")
      .eq("id", params.id)
      .maybeSingle();
    const sid = (num as { twilio_sid: string | null } | null)?.twilio_sid;

    if (sid) {
      try {
        await getTwilioService().releaseNumber(sid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "release_failed";
        return jsonError("number_release_failed", 502, { detail: msg }, cors);
      }
    }

    const { error } = await db
      .from("phone_numbers")
      .update({ status: "released", assigned_agent_id: null, updated_at: new Date().toISOString() })
      .eq("id", params.id);
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ ok: true }, { headers: cors });
  },
);
