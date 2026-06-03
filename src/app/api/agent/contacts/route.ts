import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

// Contacts of the companies this agent owns (contacts have no owner column, so
// they are scoped through the agent's owned entreprises).
export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sc = getServiceClient();

  const { data: ents, error: entErr } = await sc
    .from("entreprises")
    .select("id, name")
    .eq("owner_id", user.id);
  if (entErr) return jsonError(entErr.message, 500, {}, cors);

  const ids = (ents ?? []).map((e) => e.id);
  if (ids.length === 0) return json([], { headers: cors });

  const nameById = new Map((ents ?? []).map((e) => [e.id, e.name]));

  const { data, error } = await sc
    .from("contacts")
    .select("id, first_name, last_name, email, tel, role_title, is_decision_maker, entreprise_id")
    .in("entreprise_id", ids)
    .order("last_name", { ascending: true, nullsFirst: false });

  if (error) return jsonError(error.message, 500, {}, cors);

  const enriched = (data ?? []).map((c) => ({
    ...c,
    entreprise_nom: nameById.get(c.entreprise_id) ?? null,
  }));

  return json(enriched, { headers: cors });
});
