import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { EVENT_TYPE_COLUMNS, sanitizeCustomQuestions } from "@/lib/scheduling/data";
import { eventTypePatchSchema, requireStaff } from "../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type Params = { id: string };
type EventTypePatch = z.infer<typeof eventTypePatchSchema>;

export const PATCH = withAuth<EventTypePatch, Params>(
  { body: eventTypePatchSchema },
  async ({ user, body, params, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    const patch: Record<string, unknown> = { ...body };
    if (body.custom_questions !== undefined) {
      patch.custom_questions = sanitizeCustomQuestions(body.custom_questions);
    }

    const { data, error } = await sc
      .from("scheduling_event_types")
      .update(patch)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select(EVENT_TYPE_COLUMNS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return jsonError("slug_taken", 409, {}, cors);
      return jsonError(error.message, 500, {}, cors);
    }
    if (!data) return jsonError("not_found", 404, {}, cors);
    return json({ event_type: data }, { headers: cors });
  },
);

export const DELETE = withAuth<undefined, Params>({}, async ({ user, params, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const { error } = await sc
    .from("scheduling_event_types")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ success: true }, { headers: cors });
});
