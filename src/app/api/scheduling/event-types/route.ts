import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { EVENT_TYPE_COLUMNS, ensureHostSetup, sanitizeCustomQuestions } from "@/lib/scheduling/data";
import { eventTypeUpsertSchema, requireStaff } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  await ensureHostSetup(sc, user.id);
  const { data, error } = await sc
    .from("scheduling_event_types")
    .select(EVENT_TYPE_COLUMNS)
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ event_types: data ?? [] }, { headers: cors });
});

type EventTypeUpsert = z.infer<typeof eventTypeUpsertSchema>;

export const POST = withAuth<EventTypeUpsert>(
  { body: eventTypeUpsertSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    await ensureHostSetup(sc, user.id);

    const { data, error } = await sc
      .from("scheduling_event_types")
      .insert({
        ...body,
        custom_questions: sanitizeCustomQuestions(body.custom_questions),
        user_id: user.id,
      })
      .select(EVENT_TYPE_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return jsonError("slug_taken", 409, {}, cors);
      return jsonError(error.message, 500, {}, cors);
    }
    return json({ event_type: data }, { status: 201, headers: cors });
  },
);
