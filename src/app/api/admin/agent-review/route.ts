import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { adminAgentReviewSchema, type AdminAgentReviewPayload } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const LIMIT = 300;

const isMissingTable = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? ""));

/**
 * GET /api/admin/agent-review?agent_id=
 *
 * Les décisions de pré-tri en attente de revue, avec l'entreprise et l'agent,
 * pour l'écran de validation de Relations › Agents.
 */
export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const agentId = new URL(req.url).searchParams.get("agent_id");

  let query = getServiceClient()
    .from("agent_qualification_decisions")
    .select(
      "id, entreprise_id, agent_id, decision, note, created_at, " +
        "entreprises(id, name, ville, code_postal, telephone, email, canonical_url, site_web_canonique), " +
        "user_profiles!agent_qualification_decisions_agent_id_fkey(id, full_name, email)",
    )
    .eq("review_status", "pending")
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error)) {
      return json({ decisions: [], migration_applied: false }, { headers: cors });
    }
    return jsonError(error.message, 500, {}, cors);
  }

  return json({ decisions: data ?? [], migration_applied: true }, { headers: cors });
});

/**
 * POST /api/admin/agent-review
 *
 * Clôt une décision d'agent avec le verdict de l'admin.
 *
 * Cette route **n'applique pas** l'effet métier : la qualification (avec son
 * achievement et son opportunité auto), le blacklist, le masquage et la
 * suppression restent les fonctions existantes d'`AppDataContext`
 * (`qualifyCompany`, `blacklistCompany`, `updateCompany`, `deleteCompany`),
 * que l'écran admin appelle avant d'enregistrer le verdict ici. On évite ainsi
 * de dupliquer côté serveur une logique de qualification déjà non triviale
 * (offre active, pipeline par défaut, étape d'ordre 1, priorité selon le
 * mobile) et de la voir diverger.
 *
 * `confirmed` quand l'admin suit l'agent (qualifier une proposition
 * « qualify », masquer une proposition « skip »), `overridden` sinon.
 */
export const POST = withAuth<AdminAgentReviewPayload>(
  { role: "admin", body: adminAgentReviewSchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    const { data: decision, error: readErr } = await sc
      .from("agent_qualification_decisions")
      .select("id, decision, review_status")
      .eq("id", body.decision_id)
      .maybeSingle();

    if (readErr) {
      if (isMissingTable(readErr)) {
        return jsonError("migration_non_appliquee", 503, {}, cors);
      }
      return jsonError(readErr.message, 500, {}, cors);
    }
    if (!decision) return jsonError("decision_introuvable", 404, {}, cors);
    if (decision.review_status !== "pending") {
      return jsonError("decision_deja_traitee", 409, {}, cors);
    }

    const followsAgent =
      (decision.decision === "qualify" && body.action === "qualify") ||
      (decision.decision === "skip" && body.action === "hide");

    const { error } = await sc
      .from("agent_qualification_decisions")
      .update({
        review_status: followsAgent ? "confirmed" : "overridden",
        review_action: body.action,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", body.decision_id);

    if (error) return jsonError(error.message, 500, {}, cors);

    return json(
      { ok: true, review_status: followsAgent ? "confirmed" : "overridden" },
      { headers: cors },
    );
  },
);
