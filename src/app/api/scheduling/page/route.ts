import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { ensureHostSetup } from "@/lib/scheduling/data";
import { getAppUrl } from "@/lib/app-url";
import { requireStaff, schedulingPagePatchSchema } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Page de réservation de l'hôte courant (créée au premier accès). */
export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const page = await ensureHostSetup(sc, user.id);
  return json(
    { page, public_url: `${getAppUrl()}/rdv/${page.username}` },
    { headers: cors },
  );
});

type PagePatch = z.infer<typeof schedulingPagePatchSchema>;

export const PATCH = withAuth<PagePatch>(
  { body: schedulingPagePatchSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const staff = await requireStaff(sc, user.id, cors);
    if (!staff.ok) return staff.response;

    await ensureHostSetup(sc, user.id);

    if (body.username) {
      const { data: taken } = await sc
        .from("scheduling_pages")
        .select("id, user_id")
        .ilike("username", body.username)
        .maybeSingle();
      if (taken && taken.user_id !== user.id) {
        return jsonError("username_taken", 409, {}, cors);
      }
    }

    const { data, error } = await sc
      .from("scheduling_pages")
      .update(body)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500, {}, cors);

    return json(
      { page: data, public_url: `${getAppUrl()}/rdv/${data.username}` },
      { headers: cors },
    );
  },
);
