/**
 * IVR / SVI configuration per number (admin only). The inbound webhook reads
 * `ivr_flows.config` to present a keypad menu before routing.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const db = getServiceClient();
  const numberId = new URL(req.url).searchParams.get("numberId");
  if (!numberId) return jsonError("missing_numberId", 400, {}, cors);

  const { data, error } = await db
    .from("ivr_flows")
    .select("id, number_id, enabled, config")
    .eq("number_id", numberId)
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ flow: data ?? { number_id: numberId, enabled: false, config: {} } }, { headers: cors });
});

const menuItemSchema = z.object({
  digit: z.string().min(1).max(1),
  action: z.enum(["agent", "voicemail", "forward"]),
  target: z.string().optional(),
});

const putSchema = z.object({
  numberId: z.string().uuid(),
  enabled: z.boolean(),
  config: z.object({
    greeting: z.string().optional(),
    menu: z.array(menuItemSchema).optional(),
  }),
});

export const PUT = withAuth({ role: "admin", body: putSchema }, async ({ body, cors }) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("ivr_flows")
    .upsert(
      {
        number_id: body.numberId,
        enabled: body.enabled,
        config: body.config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "number_id" },
    )
    .select("id, number_id, enabled, config")
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ flow: data }, { headers: cors });
});
