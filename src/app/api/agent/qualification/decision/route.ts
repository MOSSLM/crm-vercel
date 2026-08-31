import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import {
  agentQualificationDecisionSchema,
  type AgentQualificationDecisionPayload,
} from "@/app/api/_lib/schemas";
import { logAgentAction } from "../_lib";
import {
  estMiseDeCote,
  normalizeServiceTags,
  type ServiceTagSetting,
} from "@/utils/serviceTags";

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
      .select("id, name, qualifie, hidden_in_qualification, service_tags")
      .eq("id", body.entreprise_id)
      .maybeSingle();
    if (entErr) return jsonError(entErr.message, 500, {}, cors);
    if (!ent) return jsonError("entreprise_introuvable", 404, {}, cors);

    // Course possible avec l'admin : l'entreprise a pu être traitée entre le
    // chargement de la file et le clic.
    if (ent.qualifie === true || ent.hidden_in_qualification === true) {
      return jsonError("entreprise_deja_traitee", 409, {}, cors);
    }

    // MÉTIER MIS DE CÔTÉ : on refuse la proposition, et on DIT pourquoi.
    //
    // La garde en base ramènerait `qualifie` à false de toute façon — mais
    // silencieusement, à la revue admin, longtemps après le clic. L'agent
    // croirait avoir qualifié. La file exclut déjà ces fiches ; ce contrôle
    // couvre la course (une fiche enrichie entre le chargement et le clic) et
    // c'est le SEUL endroit où quelqu'un attend une réponse.
    if (body.decision === "qualify") {
      const { data: reglages } = await sc
        .from("enrichment_tag_settings")
        .select("tag, allowed, demarchable");
      const tags = normalizeServiceTags((ent as { service_tags?: unknown }).service_tags);
      if (estMiseDeCote(tags, (reglages ?? []) as ServiceTagSetting[])) {
        return jsonError(
          "metier_mis_de_cote",
          409,
          {
            message:
              "Ce métier est mis de côté dans les Paramètres : le gabarit n’a pas de page pour ce service. La fiche ne peut pas être qualifiée tant qu’il n’est pas rouvert.",
          },
          cors,
        );
      }
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

/**
 * DELETE /api/agent/qualification/decision?id=<decision_id>
 *
 * Annule une décision et remet l'entreprise dans la file à qualifier — le
 * rattrapage d'un clic à côté.
 *
 * Deux garde-fous : la décision doit appartenir à l'agent, et être encore
 * `pending`. Une fois que l'admin a tranché, l'effet réel est appliqué
 * (qualification et son opportunité, blacklist, masquage, suppression) et
 * l'agent n'a plus à revenir dessus — c'est à l'admin de le faire.
 *
 * Supprimer la ligne suffit à libérer l'entreprise : l'index unique partiel ne
 * porte que sur les décisions `pending`, elle réapparaît donc dans la file de
 * tous les agents. L'annulation reste tracée dans le journal d'activité.
 */
export const DELETE = withAuth(
  { role: "freelance", capability: "qualify" },
  async ({ req, user, cors }) => {
    const decisionId = new URL(req.url).searchParams.get("id");
    if (!decisionId) return jsonError("id requis", 400, {}, cors);

    const sc = getServiceClient();

    const { data: decision, error: readErr } = await sc
      .from("agent_qualification_decisions")
      .select("id, agent_id, entreprise_id, decision, review_status")
      .eq("id", decisionId)
      .maybeSingle();

    if (readErr) {
      if (readErr.code === "42P01" || readErr.code === "PGRST205") {
        return jsonError("migration_non_appliquee", 503, {}, cors);
      }
      return jsonError(readErr.message, 500, {}, cors);
    }
    if (!decision) return jsonError("decision_introuvable", 404, {}, cors);
    if (decision.agent_id !== user.id) return jsonError("decision_autre_agent", 403, {}, cors);
    if (decision.review_status !== "pending") {
      return jsonError("decision_deja_validee", 409, {}, cors);
    }

    const { error } = await sc
      .from("agent_qualification_decisions")
      .delete()
      .eq("id", decisionId)
      .eq("agent_id", user.id)
      .eq("review_status", "pending");
    if (error) return jsonError(error.message, 500, {}, cors);

    await logAgentAction({
      agentId: user.id,
      entrepriseId: Number(decision.entreprise_id),
      action: "undo",
      metadata: { decision_id: decisionId, annulee: decision.decision },
    });

    return json(
      { ok: true, entreprise_id: Number(decision.entreprise_id) },
      { headers: cors },
    );
  },
);
