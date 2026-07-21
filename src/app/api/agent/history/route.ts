import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Exchange history (email + WhatsApp) for a company, for the agent portal. The
 * admin route /api/email/logs is admin-only; this one lets a `freelance` agent
 * read the log for a company they own or that is still in the pool — WITHOUT a
 * time filter, so exchanges made BEFORE the company was assigned to them are
 * visible (the whole point). Uses the service client, so it enforces ownership
 * itself rather than relying on RLS.
 */
export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  const entrepriseIdRaw = url.searchParams.get("entreprise_id");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 200);

  const sc = getServiceClient();

  let entrepriseId: number | null = entrepriseIdRaw ? Number(entrepriseIdRaw) : null;
  if (!entrepriseId && contactId) {
    const { data: c } = await sc
      .from("contacts")
      .select("entreprise_id")
      .eq("id", contactId)
      .maybeSingle();
    entrepriseId = ((c as { entreprise_id?: number } | null)?.entreprise_id) ?? null;
  }
  if (!entrepriseId || Number.isNaN(entrepriseId)) {
    return jsonError("entreprise_id or contact_id required", 400, {}, cors);
  }

  // Ownership guard: own company or unassigned pool company only.
  const { data: ent } = await sc
    .from("entreprises")
    .select("owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!ent) return jsonError("not_found", 404, {}, cors);
  const ownerId = (ent as { owner_id?: string | null }).owner_id ?? null;
  if (ownerId && ownerId !== user.id) return jsonError("forbidden", 403, {}, cors);

  let query = sc
    .from("email_logs")
    .select(
      "id, channel, subject, body_text, to_email, to_name, status, sent_at, contact_id, entreprise_id, opportunite_id",
    )
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (contactId) query = query.eq("contact_id", contactId);
  else query = query.eq("entreprise_id", entrepriseId);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ logs: data ?? [] }, { headers: cors });
});
