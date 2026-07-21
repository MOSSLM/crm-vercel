/**
 * Simulation-only endpoint. When the softphone runs in mock mode (no Twilio
 * Voice credentials), the browser can't register a real Device, so "calls" are
 * logged through here instead — producing the same `calls` / `activity_log` /
 * `email_logs` rows a real call would, for a faithful end-to-end demo.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { STAFF_ROLES } from "@/app/api/_lib/require-role";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { isMockMode } from "@/lib/twilio/config";
import { resolveAgentCallerNumber } from "@/lib/twilio/call-routing";
import { upsertCall, finalizeCall } from "@/lib/twilio/call-logging";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  to: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]).optional(),
  contactId: z.string().optional(),
  entrepriseId: z.number().optional(),
  opportuniteId: z.string().optional(),
  durationSeconds: z.number().int().min(0).max(36000).optional(),
  status: z.enum(["completed", "no-answer", "busy", "failed", "canceled"]).optional(),
});

const randSid = () =>
  "CA" +
  Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

export const POST = withAuth({ role: STAFF_ROLES, body: bodySchema }, async ({ user, body, cors }) => {
  if (!isMockMode()) {
    return jsonError("not_in_mock_mode", 400, {}, cors);
  }

  const db = getServiceClient();
  const callSid = randSid();
  const caller = await resolveAgentCallerNumber(db, user.id);
  const direction = body.direction ?? "outbound";
  const status = body.status ?? "completed";
  const duration = body.durationSeconds ?? Math.floor(30 + Math.random() * 120);

  await upsertCall(db, {
    callSid,
    direction,
    from: direction === "outbound" ? caller?.e164 ?? "+33100000000" : body.to,
    to: direction === "outbound" ? body.to : caller?.e164 ?? "+33100000000",
    numberId: caller?.numberId ?? null,
    agentId: user.id,
    contactId: body.contactId ?? null,
    entrepriseId: body.entrepriseId ?? null,
    opportuniteId: body.opportuniteId ?? null,
    status: "in-progress",
  });

  await finalizeCall(db, {
    callSid,
    status,
    durationSeconds: status === "completed" ? duration : 0,
  });

  return json({ ok: true, callSid, simulated: true, status, durationSeconds: duration }, { headers: cors });
});
