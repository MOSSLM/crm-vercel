import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import {
  agentQualificationDecisionSchema,
  type AgentQualificationDecisionPayload,
} from "@/app/api/_lib/schemas";
import { logAgentAction } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/agent/qualification/decision
 *
 * Enregistre le pré-tri de l'agent : « qualifier » ou « masquer ».
 *
 * Volontairement, **rien n'est écrit sur `entreprises`** : ni `qualifie`, ni
 * `hidden_in_qualification`. Une décision d'agent est une proposition. Elle
 * sort l'entreprise de la file de tous les agents (index unique partiel sur
 * `entreprise_id where review_status = 'pending'`) et attend la revue admin,
 * qui seule produit l'effet réel (qualification + opportunité, blacklist,
 * masquage, remise en file ou suppression).
 *
 * L'agent n'a jamais accès au blacklist ni à la suppression : ce sont les seuls
 * gestes irréversibles, ils restent côté admin.
 */
export const POST = withAuth<AgentQualificationDecisionPayload>(
  { role: "freelance", capability: "qualify", body: agentQualificationDecisionSchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    const { data: ent, error: entErr } = await sc
      .from("entreprises")
      .select("id, name, qualifie, hidden_in_qualification")
      .eq("id", body.entreprise_id)
      .maybeSingle();
    if (entErr) return jsonError(entErr.message, 500, {}, cors);
    if (!ent) return jsonError("entreprise_introuvable", 404, {}, cors);

    // Course possible avec l'admin : l'entreprise a pu être traitée entre le
    // chargement de la file et le clic.
    if (ent.qualifie === true || ent.hidden_in_qualification === true) {
      return jsonError("entreprise_deja_traitee", 409, {}, cors);
    }

    const { data: inserted, error } = await sc
      .from("agent_qualification_decisions")
      .insert({
        entreprise_id: body.entreprise_id,
        agent_id: user.id,
        decision: body.decision,
        note: body.note ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // 23505 = violation de l'index unique partiel : un autre agent l'a prise.
      if (error.code === "23505") {
        return jsonError("entreprise_deja_traitee", 409, {}, cors);
      }
      if (error.code === "42P01" || error.code === "PGRST205") {
        return jsonError(
          "migration_non_appliquee",
          503,
          { table: "agent_qualification_decisions" },
          cors,
        );
      }
      return jsonError(error.message, 500, {}, cors);
    }

    await logAgentAction({
      agentId: user.id,
      entrepriseId: body.entreprise_id,
      action: body.decision,
      metadata: { decision_id: inserted?.id ?? null, name: ent.name ?? null },
    });

    return json({ ok: true, decision_id: inserted?.id ?? null }, { headers: cors });
  },
);
