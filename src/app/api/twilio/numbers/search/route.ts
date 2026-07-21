/**
 * Search Twilio for available numbers to purchase (admin only). In mock mode
 * returns plausible FR numbers so the buy flow is demoable without an account.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getTwilioService } from "@/lib/twilio/service";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  country: z.string().length(2).default("FR"),
  type: z.enum(["local", "mobile", "tollfree"]).default("local"),
  areaCode: z.string().optional(),
  contains: z.string().optional(),
  smsEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const POST = withAuth({ role: "admin", body: bodySchema }, async ({ body, cors }) => {
  try {
    const results = await getTwilioService().searchAvailableNumbers(body);
    return json({ numbers: results }, { headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "search_failed";
    return jsonError("number_search_failed", 502, { detail: msg }, cors);
  }
});
