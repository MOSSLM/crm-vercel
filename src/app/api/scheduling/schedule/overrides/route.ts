import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { ensureHostSetup, getScheduleBundle } from "@/lib/scheduling/data";
import { overrideUpsertSchema, requireStaff } from "../../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

type OverrideUpsert = z.infer<typeof overrideUpsertSchema>;

/** Ajoute/remplace une exception de date (congé ou horaires spéciaux). */
export const POST = withAuth<OverrideUpsert>(
  { body: overrideUpsertSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    await ensureHostSetup(sc, user.id);
    const bundle = await getScheduleBundle(sc, user.id, null);
    if (!bundle) return jsonError("schedule_not_found", 404, {}, cors);

    const { data, error } = await sc
      .from("scheduling_date_overrides")
      .upsert(
        {
          schedule_id: bundle.schedule.id,
          date: body.date,
          is_unavailable: body.is_unavailable,
          ranges: body.is_unavailable ? [] : body.ranges,
        },
        { onConflict: "schedule_id,date" },
      )
      .select("id, date, is_unavailable, ranges")
      .single();
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ override: data }, { headers: cors });
  },
);

const deleteSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
type DeleteBody = z.infer<typeof deleteSchema>;

export const DELETE = withAuth<DeleteBody>(
  { body: deleteSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    const bundle = await getScheduleBundle(sc, user.id, null);
    if (!bundle) return jsonError("schedule_not_found", 404, {}, cors);

    const { error } = await sc
      .from("scheduling_date_overrides")
      .delete()
      .eq("schedule_id", bundle.schedule.id)
      .eq("date", body.date);
    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ success: true }, { headers: cors });
  },
);
