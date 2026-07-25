import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { ensureHostSetup, getScheduleBundle } from "@/lib/scheduling/data";
import { requireStaff, schedulePutSchema } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Planning par défaut de l'hôte : fuseau + règles hebdo + overrides. */
export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  await ensureHostSetup(sc, user.id);
  const bundle = await getScheduleBundle(sc, user.id, null);
  if (!bundle) return jsonError("schedule_not_found", 404, {}, cors);
  return json(bundle, { headers: cors });
});

type SchedulePut = z.infer<typeof schedulePutSchema>;

/** Remplace l'intégralité des règles hebdo (et le fuseau) du planning par défaut. */
export const PUT = withAuth<SchedulePut>(
  { body: schedulePutSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    await ensureHostSetup(sc, user.id);
    const bundle = await getScheduleBundle(sc, user.id, null);
    if (!bundle) return jsonError("schedule_not_found", 404, {}, cors);

    if (body.timezone) {
      const { error } = await sc
        .from("scheduling_schedules")
        .update({ timezone: body.timezone })
        .eq("id", bundle.schedule.id);
      if (error) return jsonError(error.message, 500, {}, cors);
    }

    const { error: delError } = await sc
      .from("scheduling_schedule_rules")
      .delete()
      .eq("schedule_id", bundle.schedule.id);
    if (delError) return jsonError(delError.message, 500, {}, cors);

    if (body.rules.length > 0) {
      const { error: insError } = await sc
        .from("scheduling_schedule_rules")
        .insert(body.rules.map((r) => ({ ...r, schedule_id: bundle.schedule.id })));
      if (insError) return jsonError(insError.message, 500, {}, cors);
    }

    const fresh = await getScheduleBundle(sc, user.id, null);
    return json(fresh, { headers: cors });
  },
);
