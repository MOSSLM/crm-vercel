import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { SITE_DOMAIN } from "@/lib/site-domain";
import { getAgentPipeline } from "@/app/api/agent/_lib";
import { dealsByEntreprise, type PipelineRow, type StageRow } from "../_agent-pool";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);


/**
 * Releases the deals this agent still owns on companies that are no longer
 * his. `entreprises.owner_id` is authoritative — a deal that outlived its
 * company's release is what used to show a prospect on the agent's pipeline
 * while the admin counted zero. Reconciling here means opening the Agents page
 * repairs any leftover from before the fix. Best-effort and idempotent.
 */
async function releaseOrphanDeals(
  sc: ReturnType<typeof getServiceClient>,
  agentId: string,
  ownedEntIds: number[],
): Promise<void> {
  const { data: deals } = await sc
    .from("opportunites")
    .select("id, entreprise_id")
    .eq("owner_id", agentId);

  const owned = new Set(ownedEntIds);
  const orphans = (deals ?? [])
    .filter((d) => d.entreprise_id == null || !owned.has(d.entreprise_id as number))
    .map((d) => d.id as string);

  if (orphans.length > 0) {
    await sc.from("opportunites").update({ owner_id: null }).in("id", orphans);
  }
}

// Admin: the prospects owned by an agent, with per-company audit and demo-site
// readiness so the admin can check in one click that everything is ready to be
// sent before the agent launches a sequence.
export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const agentId = new URL(req.url).searchParams.get("agent_id");
  if (!agentId) return jsonError("agent_id requis", 400, {}, cors);

  const sc = getServiceClient();
  const { data: ents, error: entErr } = await sc
    .from("entreprises")
    .select("id, name, ville")
    .eq("owner_id", agentId)
    .order("name");
  if (entErr) return jsonError(entErr.message, 500, {}, cors);

  await releaseOrphanDeals(
    sc,
    agentId,
    (ents ?? []).map((e) => e.id as number),
  );

  const entIds = (ents ?? []).map((e) => e.id as number);
  if (entIds.length === 0) return json({ prospects: [] }, { headers: cors });

  const { data: opps } = await sc
    .from("opportunites")
    .select("id, entreprise_id, pipeline_id, stage_id, updated_at")
    .in("entreprise_id", entIds);
  const oppIds = (opps ?? []).map((o) => o.id as string);
  const entByOpp = new Map((opps ?? []).map((o) => [o.id as string, o.entreprise_id as number]));

  // Pipelines CRM des entreprises attribuées, pour pouvoir filtrer (et retirer)
  // par pipeline comme dans le pool. Le pipeline « Agent SAMA » est écarté : il
  // est commun à toutes les entreprises attribuées, donc sans valeur de tri.
  const [agentPipeline, pipelinesRes, stagesRes] = await Promise.all([
    getAgentPipeline(),
    sc.from("pipelines").select("id, nom, ordre").order("ordre", { ascending: true }),
    sc.from("etapes_pipeline").select("id, nom, pipeline_id, ordre").order("ordre", { ascending: true }),
  ]);
  const pipelineRows = (pipelinesRes.data ?? []) as PipelineRow[];
  const stageRows = (stagesRes.data ?? []) as StageRow[];
  const dealsByEnt = dealsByEntreprise(
    (opps ?? []).map((o) => ({
      entreprise_id: (o.entreprise_id as number | null) ?? null,
      pipeline_id: (o.pipeline_id as string | null) ?? null,
      stage_id: (o.stage_id as number | null) ?? null,
      updated_at: (o.updated_at as string | null) ?? null,
    })),
    new Map(pipelineRows.map((p) => [p.id, p])),
    new Map(stageRows.map((s) => [s.id, s])),
    agentPipeline?.pipelineId ?? null,
  );

  const [auditsRes, sitesRes] = await Promise.all([
    oppIds.length > 0
      ? sc.from("audits").select("opportunite_id, statut, pdf_url").in("opportunite_id", oppIds)
      : Promise.resolve({ data: [] as { opportunite_id: string; statut: string; pdf_url: string | null }[] }),
    sc
      .from("sites")
      .select("enterprise_id, is_published, published_subdomain, published_domain, build_stage, is_template")
      .in("enterprise_id", entIds),
  ]);

  // Best audit per company: ready first.
  const auditByEnt = new Map<number, { statut: string; pdf_url: string | null }>();
  for (const a of auditsRes.data ?? []) {
    const entId = entByOpp.get(a.opportunite_id as string);
    if (entId == null) continue;
    const cur = auditByEnt.get(entId);
    const isReady = a.statut === "ready" && !!a.pdf_url;
    if (!cur || (isReady && !(cur.statut === "ready" && cur.pdf_url))) {
      auditByEnt.set(entId, { statut: a.statut as string, pdf_url: (a.pdf_url as string | null) ?? null });
    }
  }

  // Best demo site per company: published first, then kanban-ready.
  type SiteRow = {
    enterprise_id: number | null;
    is_published: boolean | null;
    published_subdomain: string | null;
    published_domain: string | null;
    build_stage: string | null;
    is_template: boolean | null;
  };
  const siteByEnt = new Map<number, SiteRow>();
  const rank = (s: SiteRow) => (s.is_published ? 2 : s.build_stage === "pret" ? 1 : 0);
  for (const s of (sitesRes.data ?? []) as SiteRow[]) {
    if (s.is_template === true || s.enterprise_id == null) continue;
    const cur = siteByEnt.get(s.enterprise_id);
    if (!cur || rank(s) > rank(cur)) siteByEnt.set(s.enterprise_id, s);
  }

  const siteUrl = (s: SiteRow | undefined): string | null => {
    if (!s) return null;
    if (s.published_domain) {
      return s.published_domain.startsWith("http") ? s.published_domain : `https://${s.published_domain}`;
    }
    if (s.published_subdomain) return `https://${s.published_subdomain}.${SITE_DOMAIN}`;
    return null;
  };

  // Jalons amont du marketing pipeline (enrichissement puis validation des
  // données), pour que l'admin puisse vérifier les 4 étapes depuis cet écran et
  // pas seulement l'audit et le site démo.
  const [enrichRes, projectsRes] = await Promise.all([
    sc.from("automated_enrichment").select("entreprise_id, status, updated_at").in("entreprise_id", entIds),
    sc
      .from("lead_magnet_projects")
      .select("entreprise_id, pret_pour_lm, enrichment_validated")
      .in("entreprise_id", entIds),
  ]);

  // Statuts que l'edge function considère comme « pas encore enrichi ».
  const ENRICH_PENDING = new Set(["pending", "queued", "running", "failed", "error"]);
  const enrichedEnts = new Set<number>();
  for (const r of enrichRes.data ?? []) {
    const status = r.status as string | null;
    if (status == null || !ENRICH_PENDING.has(status)) enrichedEnts.add(Number(r.entreprise_id));
  }

  const validatedEnts = new Set<number>();
  for (const p of projectsRes.data ?? []) {
    // `enrichment_validated` peut manquer si la migration n'est pas appliquée :
    // on retombe alors sur `pret_pour_lm`, comme le board.
    const validated =
      p.enrichment_validated === true ||
      (p.enrichment_validated === undefined && p.pret_pour_lm === true);
    if (validated) validatedEnts.add(Number(p.entreprise_id));
  }

  const prospects = (ents ?? []).map((e) => {
    const entId = e.id as number;
    const audit = auditByEnt.get(entId);
    const site = siteByEnt.get(entId);
    return {
      id: e.id,
      name: e.name,
      ville: e.ville,
      deals: dealsByEnt.get(entId) ?? [],
      enriched: enrichedEnts.has(entId),
      data_validated: validatedEnts.has(entId),
      audit: audit
        ? { statut: audit.statut, url: audit.pdf_url, ready: audit.statut === "ready" && !!audit.pdf_url }
        : null,
      demo: site
        ? {
            url: siteUrl(site),
            is_published: site.is_published === true,
            build_stage: site.build_stage,
            ready: site.is_published === true || site.build_stage === "pret",
          }
        : null,
    };
  });

  return json(
    {
      prospects,
      pipelines: pipelineRows
        .filter((p) => p.id !== agentPipeline?.pipelineId)
        .map((p) => ({ id: p.id, nom: p.nom ?? "Sans nom", ordre: p.ordre ?? 0 })),
    },
    { headers: cors },
  );
});
