import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { emailLogsQuerySchema, parseQuery } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const GET = withAuth({ role: "admin" },async ({ req, cors }) => {
  const url = new URL(req.url);
  const parsed = parseQuery(url, emailLogsQuerySchema, cors);
  if (!parsed.ok) return parsed.response;
  const { contact_id, entreprise_id, opportunite_id, limit } = parsed.data;

  try {
    let query = getServiceClient()
      .from("email_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (contact_id) query = query.eq("contact_id", contact_id);
    if (entreprise_id) query = query.eq("entreprise_id", entreprise_id);
    if (opportunite_id) query = query.eq("opportunite_id", opportunite_id);

    const { data, error } = await query;
    if (error) throw error;

    return json({ logs: data ?? [] }, { headers: cors });
  } catch (err) {
    console.error("[email/logs] error:", err);
    return jsonError("Erreur serveur", 500, {}, cors);
  }
});
