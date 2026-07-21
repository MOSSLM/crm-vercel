/**
 * Update a portability request (admin only): advance status, add notes.
 */
import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const patchSchema = z.object({
  status: z
    .enum(["draft", "submitted", "pending_carrier", "blocked_mobile", "completed", "rejected"])
    .optional(),
  currentCarrier: z.string().nullable().optional(),
  accountHolder: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = withAuth<z.infer<typeof patchSchema>, { id: string }>(
  { role: "admin", body: patchSchema },
  async ({ body, params, cors }) => {
    const db = getServiceClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === "submitted") patch.submitted_at = new Date().toISOString();
    }
    if (body.currentCarrier !== undefined) patch.current_carrier = body.currentCarrier;
    if (body.accountHolder !== undefined) patch.account_holder = body.accountHolder;
    if (body.notes !== undefined) patch.notes = body.notes;

    const { data, error } = await db
      .from("number_porting_requests")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .maybeSingle();
    if (error) return jsonError(error.message, 500, {}, cors);
    if (!data) return jsonError("not_found", 404, {}, cors);
    return json({ request: data }, { headers: cors });
  },
);
