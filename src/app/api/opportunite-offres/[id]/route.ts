import { requireUser } from "@/app/api/_lib/auth";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const ALLOWED = ["offre_nom", "offre_prix_ht", "statut", "notes"];
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k)),
  );

  if (Object.keys(patch).length === 0) {
    return jsonError("Aucun champ modifiable fourni", 400, {}, cors);
  }

  const { data, error } = await getServiceClient()
    .from("opportunite_offres")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = corsHeadersFor(req);
  const auth = await requireUser(req, cors);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { error } = await getServiceClient()
    .from("opportunite_offres")
    .delete()
    .eq("id", id);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ success: true }, { headers: cors });
}
