import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { logPipelineStep } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  action: z.enum(["create", "validate"]),
  opportunite_ids: z.array(z.string().uuid()).min(1).max(100),
});
type Body = z.infer<typeof bodySchema>;

/**
 * POST /api/agent/marketing-pipeline/audit
 *
 * Étape 4 du pipeline, côté agent : création puis validation de l'audit.
 * Côté admin, `createAudit` et `validateAudits` écrivent depuis le navigateur ;
 * on passe par le serveur pour l'agent afin de vérifier la propriété de
 * l'entreprise et de journaliser l'action.
 *
 * Le contenu de l'audit vient de `getDefaultAuditContent`, le même helper que
 * la création admin — les deux produisent le même document.
 */
export const POST = withAuth<Body>(
  { role: "freelance", capability: "marketing_pipeline", body: bodySchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    const { data: opps, error: oppErr } = await sc
      .from("opportunites")
      .select("id, entreprise_id, name")
      .in("id", body.opportunite_ids);
    if (oppErr) return jsonError(oppErr.message, 500, {}, cors);
    if (!opps || opps.length === 0) return jsonError("opportunite_introuvable", 404, {}, cors);

    const entIds = [...new Set(opps.map((o) => Number(o.entreprise_id)).filter(Number.isFinite))];
    const { data: owned } = await sc
      .from("entreprises")
      .select("id, name, ville, adresse, logo_url")
      .in("id", entIds)
      .eq("owner_id", user.id);

    const entById = new Map((owned ?? []).map((e) => [Number(e.id), e]));
    const allowed = opps.filter((o) => entById.has(Number(o.entreprise_id)));
    if (allowed.length === 0) return jsonError("entreprise_non_attribuee", 403, {}, cors);

    if (body.action === "validate") {
      const allowedOppIds = allowed.map((o) => o.id as string);
      const { data: audits } = await sc
        .from("audits")
        .select("id, opportunite_id")
        .in("opportunite_id", allowedOppIds);
      const auditIds = (audits ?? []).map((a) => a.id as string);
      if (auditIds.length === 0) return jsonError("aucun_audit", 404, {}, cors);

      const { error } = await sc
        .from("audits")
        .update({ statut: "ready", updated_at: new Date().toISOString() })
        .in("id", auditIds);
      if (error) return jsonError(error.message, 500, {}, cors);

      await Promise.all(
        allowed.map((o) =>
          logPipelineStep({
            agentId: user.id,
            entrepriseId: Number(o.entreprise_id),
            action: "validate_audit",
            metadata: { opportunite_id: o.id },
          }),
        ),
      );
      return json({ ok: true, validated: auditIds.length }, { headers: cors });
    }

    // action === "create" — on saute les opportunités qui ont déjà un audit.
    const allowedOppIds = allowed.map((o) => o.id as string);
    const { data: existing } = await sc
      .from("audits")
      .select("opportunite_id")
      .in("opportunite_id", allowedOppIds);
    const already = new Set((existing ?? []).map((a) => a.opportunite_id as string));

    const { data: sites } = await sc
      .from("sites")
      .select("enterprise_id, published_subdomain, published_domain, is_template")
      .in("enterprise_id", entIds);
    const demoByEnt = new Map<number, string | null>();
    for (const s of sites ?? []) {
      if (s.is_template === true || s.enterprise_id == null) continue;
      const url = s.published_domain
        ? String(s.published_domain).startsWith("http")
          ? String(s.published_domain)
          : `https://${s.published_domain}`
        : null;
      if (url) demoByEnt.set(Number(s.enterprise_id), url);
    }

    const toCreate = allowed.filter((o) => !already.has(o.id as string));
    if (toCreate.length === 0) {
      return json({ ok: true, created: 0, skipped: allowed.length }, { headers: cors });
    }

    const rows = toCreate.map((o) => {
      const ent = entById.get(Number(o.entreprise_id));
      const demoUrl = demoByEnt.get(Number(o.entreprise_id)) ?? undefined;
      return {
        opportunite_id: o.id,
        entreprise_nom: ent?.name ?? o.name ?? null,
        entreprise_ville: ent?.ville ?? null,
        entreprise_logo_url: ent?.logo_url ?? null,
        demo_site_url: demoUrl ?? null,
        content: getDefaultAuditContent({
          entreprise_nom: ent?.name ?? undefined,
          entreprise_adresse: ent?.adresse ?? undefined,
          entreprise_ville: ent?.ville ?? undefined,
          demo_url: demoUrl,
        }),
        statut: "draft",
      };
    });

    const { error } = await sc.from("audits").insert(rows);
    if (error) return jsonError(error.message, 500, {}, cors);

    await Promise.all(
      toCreate.map((o) =>
        logPipelineStep({
          agentId: user.id,
          entrepriseId: Number(o.entreprise_id),
          action: "create_audit",
          metadata: { opportunite_id: o.id },
        }),
      ),
    );

    return json(
      { ok: true, created: rows.length, skipped: allowed.length - rows.length },
      { headers: cors },
    );
  },
);
