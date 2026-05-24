import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);
  const opportuniteId = url.searchParams.get("opportunite_id");
  const statut = url.searchParams.get("statut");

  let query = getServiceClient()
    .from("opportunite_tasks")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (opportuniteId) query = query.eq("opportunite_id", opportuniteId);
  if (statut) query = query.eq("statut", statut);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { headers: cors });
});

export const POST = withAuth({}, async ({ req, cors }) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide", 400, {}, cors);
  }

  const { opportunite_id, titre, description, type, due_date, assigned_to } = body;

  if (!opportunite_id || !titre) return jsonError("opportunite_id et titre requis", 400, {}, cors);

  const { data, error } = await getServiceClient()
    .from("opportunite_tasks")
    .insert({
      opportunite_id,
      titre,
      description: description ?? null,
      type: type ?? "relance",
      due_date: due_date ?? null,
      assigned_to: assigned_to ?? null,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500, {}, cors);
  return json(data, { status: 201, headers: cors });
});
