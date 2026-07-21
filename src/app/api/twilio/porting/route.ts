/**
 * Number portability requests (admin only). FR mobile port-ins are paused by
 * Twilio, so a mobile request is auto-parked as 'blocked_mobile'.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("number_porting_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ requests: data ?? [] }, { headers: cors });
});

const createSchema = z.object({
  e164: z.string().min(4),
  numberType: z.enum(["local", "mobile", "tollfree"]).default("local"),
  currentCarrier: z.string().optional(),
  accountHolder: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth({ role: "admin", body: createSchema }, async ({ user, body, cors }) => {
  const db = getServiceClient();

  // FR mobile port-ins are currently paused by Twilio → park them.
  const status = body.numberType === "mobile" ? "blocked_mobile" : "draft";

  const { data, error } = await db
    .from("number_porting_requests")
    .insert({
      e164: body.e164,
      number_type: body.numberType,
      current_carrier: body.currentCarrier ?? null,
      account_holder: body.accountHolder ?? null,
      notes: body.notes ?? null,
      status,
      requested_by: user.id,
    })
    .select("*")
    .maybeSingle();
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ request: data }, { headers: cors });
});
