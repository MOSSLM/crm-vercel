import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { googleEnv } from "@/lib/scheduling/google-calendar";
import { requireStaff } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Connexions d'agenda de l'hôte — projection SANS tokens (la table est
 * accessible service-role uniquement ; on n'expose que les métadonnées).
 */
export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const { data, error } = await sc
    .from("scheduling_calendar_connections")
    .select("id, provider, account_email, write_calendar_id, busy_calendar_ids, sync_enabled, last_error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return jsonError(error.message, 500, {}, cors);

  return json(
    { connections: data ?? [], google_available: !!googleEnv() },
    { headers: cors },
  );
});

/** Déconnecte un agenda (?id=…). */
export const DELETE = withAuth({}, async ({ user, req, cors }) => {
  const sc = getServiceClient();
  const staff = await requireStaff(sc, user.id, cors);
  if (!staff.ok) return staff.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("missing_id", 400, {}, cors);

  const { error } = await sc
    .from("scheduling_calendar_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ success: true }, { headers: cors });
});
