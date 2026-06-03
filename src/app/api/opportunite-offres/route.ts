import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: "admin" },async ({ req, cors }) => {
  const url = new URL(req.url);
  const opportuniteId = url.searchParams.get("opportunite_id");

  let query = getServiceClient()
    .from("opportunite_offres")
    .select("*, offres(id, nom, type, prix_ht, devise, billing_period)")
    .order("created_at", { ascending: true });

  if (opportuniteId) query = query.eq("opportunite_id", opportuniteId);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
});

export const POST = withAuth({ role: "admin" },async ({ req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const { opportunite_id, offre_id, offre_nom, offre_prix_ht, statut, notes } = body;

  if (!opportunite_id || !offre_nom) return jsonError("opportunite_id et offre_nom requis", 400, {}, cors);

  const { data, error } = await getServiceClient()
    .from("opportunite_offres")
    .insert({
      opportunite_id,
      offre_id: offre_id ?? null,
      offre_nom,
      offre_prix_ht: offre_prix_ht ?? null,
      statut: statut ?? "proposee",
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 201, headers: cors });
});
