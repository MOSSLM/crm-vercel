import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN || "samadigitalstudio.fr";

/** How many opportunities to pull into the marketing board at once. */
const OPPORTUNITY_LIMIT = 1000;

type OppRow = {
  id: string;
  entreprise_id: number | null;
  pipeline_id: string | null;
  name: string | null;
  montant: number | null;
  priorite: string | null;
  type: string | null;
  mrr: number | null;
  recurrence_months: number | null;
  tags: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type EntRow = {
  id: number;
  name: string | null;
  canonical_url: string | null;
  site_web_canonique: string | null;
  logo_url: string | null;
  ville: string | null;
  owner_id: string | null;
};

type ProjectRow = {
  id: string;
  opportunite_id: string | null;
  entreprise_id: number | null;
  statut: string | null;
  pret_pour_lm: boolean | null;
  enrichment_validated?: boolean | null;
};

type EnrichRow = {
  entreprise_id: number | null;
  status: string | null;
  website_url: string | null;
  updated_at: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  enterprise_id: number | null;
  build_stage: string | null;
  is_published: boolean | null;
  published_subdomain: string | null;
  published_domain: string | null;
  is_template: boolean | null;
  is_claude_design: boolean | null;
};

type AuditRow = {
  id: string;
  opportunite_id: string | null;
  statut: string | null;
  pdf_url: string | null;
};

type AgentRow = { id: string; full_name: string | null; email: string | null };

const ENRICHMENT_FAIL_STATUSES = new Set(["pending", "queued", "running", "failed", "error"]);

function siteUrl(s: SiteRow | undefined): string | null {
  if (!s) return null;
  if (s.published_domain) {
    return s.published_domain.startsWith("http") ? s.published_domain : `https://${s.published_domain}`;
  }
  if (s.published_subdomain) return `https://${s.published_subdomain}.${SITE_DOMAIN}`;
  return null;
}

/**
 * GET /api/marketing-pipeline/board
 *
 * Aggregates, for every opportunity linked to a company, the state of the
 * marketing production workflow: enrichment → prêt pour LM → site démo → audit
 * → attribution d'un agent. Each item is placed in one of 5 columns (1..5) that
 * mirror that linear flow. Also returns the site templates (to create a demo)
 * and the freelance agents (to attribute a prospect).
 */
export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();

  const { data: oppsData, error: oppErr } = await supabase
    .from("opportunites")
    .select(
      "id, entreprise_id, pipeline_id, name, montant, priorite, type, mrr, recurrence_months, tags, updated_at, created_at",
    )
    .not("entreprise_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(OPPORTUNITY_LIMIT);
  if (oppErr) return jsonError(oppErr.message, 500);

  const opps = (oppsData ?? []) as OppRow[];
  const oppIds = opps.map((o) => o.id);
  const entIds = [...new Set(opps.map((o) => o.entreprise_id).filter((v): v is number => v != null))];

  if (opps.length === 0) {
    return json({ items: [], templates: [], agents: [], pipelines: [], has_validated_column: true });
  }

  // The explicit human-validation flag lives in a column added by a later
  // migration; degrade to `pret_pour_lm` when it isn't there yet.
  let hasValidatedColumn = true;
  let projectRows: ProjectRow[] = [];
  {
    const withCol = await supabase
      .from("lead_magnet_projects")
      .select("id, opportunite_id, entreprise_id, statut, pret_pour_lm, enrichment_validated")
      .in("opportunite_id", oppIds);
    if (withCol.error) {
      hasValidatedColumn = false;
      const withoutCol = await supabase
        .from("lead_magnet_projects")
        .select("id, opportunite_id, entreprise_id, statut, pret_pour_lm")
        .in("opportunite_id", oppIds);
      if (withoutCol.error) return jsonError(withoutCol.error.message, 500);
      projectRows = (withoutCol.data ?? []) as ProjectRow[];
    } else {
      projectRows = (withCol.data ?? []) as ProjectRow[];
    }
  }

  const [entsRes, enrichRes, sitesRes, auditsRes, agentsRes, pipelinesRes] = await Promise.all([
    supabase
      .from("entreprises")
      .select("id, name, canonical_url, site_web_canonique, logo_url, ville, owner_id")
      .in("id", entIds),
    entIds.length > 0
      ? supabase
          .from("automated_enrichment")
          .select("entreprise_id, status, website_url, updated_at")
          .in("entreprise_id", entIds)
      : Promise.resolve({ data: [] as EnrichRow[], error: null }),
    supabase
      .from("sites")
      .select(
        "id, name, enterprise_id, build_stage, is_published, published_subdomain, published_domain, is_template, is_claude_design",
      ),
    oppIds.length > 0
      ? supabase.from("audits").select("id, opportunite_id, statut, pdf_url").in("opportunite_id", oppIds)
      : Promise.resolve({ data: [] as AuditRow[], error: null }),
    supabase.from("user_profiles").select("id, full_name, email").eq("role", "freelance"),
    supabase.from("pipelines").select("id, nom, ordre, is_default").order("ordre", { ascending: true }),
  ]);

  if (entsRes.error) return jsonError(entsRes.error.message, 500);
  if (sitesRes.error) return jsonError(sitesRes.error.message, 500);

  const isValidated = (p: ProjectRow) =>
    hasValidatedColumn ? p.enrichment_validated === true : p.pret_pour_lm === true;

  const entById = new Map<number, EntRow>();
  for (const e of (entsRes.data ?? []) as EntRow[]) entById.set(e.id, e);

  // One lead-magnet project per opportunity (keep the validated one if any).
  const projectByOpp = new Map<string, ProjectRow>();
  for (const p of projectRows) {
    if (!p.opportunite_id) continue;
    const cur = projectByOpp.get(p.opportunite_id);
    if (!cur || (isValidated(p) && !isValidated(cur))) projectByOpp.set(p.opportunite_id, p);
  }

  // Latest enrichment per company.
  const enrichByEnt = new Map<number, EnrichRow>();
  for (const r of ((enrichRes.data ?? []) as EnrichRow[])) {
    if (r.entreprise_id == null) continue;
    const cur = enrichByEnt.get(r.entreprise_id);
    if (!cur || (r.updated_at ?? "") > (cur.updated_at ?? "")) enrichByEnt.set(r.entreprise_id, r);
  }

  // Best demo site per company (published > pret > other), templates excluded.
  const allSites = (sitesRes.data ?? []) as SiteRow[];
  const templates = allSites
    .filter((s) => s.is_template === true)
    .map((s) => ({ id: s.id, name: s.name ?? "Template", is_claude_design: s.is_claude_design === true }));
  const rank = (s: SiteRow) => (s.is_published ? 2 : s.build_stage === "pret" ? 1 : 0);
  const siteByEnt = new Map<number, SiteRow>();
  for (const s of allSites) {
    if (s.is_template === true || s.enterprise_id == null) continue;
    const cur = siteByEnt.get(s.enterprise_id);
    if (!cur || rank(s) > rank(cur)) siteByEnt.set(s.enterprise_id, s);
  }

  // Best audit per opportunity (ready first).
  const auditByOpp = new Map<string, AuditRow>();
  for (const a of ((auditsRes.data ?? []) as AuditRow[])) {
    if (!a.opportunite_id) continue;
    const cur = auditByOpp.get(a.opportunite_id);
    const isReady = a.statut === "ready";
    if (!cur || (isReady && cur.statut !== "ready")) auditByOpp.set(a.opportunite_id, a);
  }

  const agents = ((agentsRes.data ?? []) as AgentRow[]).map((a) => ({
    id: a.id,
    name: a.full_name?.trim() || a.email || "Agent",
  }));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const items = opps.map((o) => {
    const ent = o.entreprise_id != null ? entById.get(o.entreprise_id) : undefined;
    const project = projectByOpp.get(o.id) ?? null;
    const enrich = o.entreprise_id != null ? enrichByEnt.get(o.entreprise_id) : undefined;
    const site = o.entreprise_id != null ? siteByEnt.get(o.entreprise_id) : undefined;
    const audit = auditByOpp.get(o.id) ?? null;
    const owner = ent?.owner_id ? agentById.get(ent.owner_id) : undefined;

    const enriched = !!enrich && !(enrich.status != null && ENRICHMENT_FAIL_STATUSES.has(enrich.status));

    // Milestones (linear).
    const m1 = !!project && isValidated(project); // enrichment validated → ready for LM
    const m2 = !!site; // demo site created
    const m3 = !!site && (site.is_published === true || site.build_stage === "pret"); // site validated
    const m5 = audit?.statut === "ready"; // audit validated

    let column = 1;
    if (!m1) column = 1;
    else if (!m2) column = 2;
    else if (!m3) column = 3;
    else if (!m5) column = 4;
    else column = 5;

    return {
      id: o.id,
      name: o.name ?? ent?.name ?? "Opportunité",
      entreprise_id: o.entreprise_id,
      pipeline_id: o.pipeline_id,
      company_name: ent?.name ?? o.name ?? null,
      company_url: ent?.canonical_url ?? ent?.site_web_canonique ?? null,
      logo_url: ent?.logo_url ?? null,
      ville: ent?.ville ?? null,
      priorite: o.priorite ?? null,
      montant: o.montant ?? null,
      type: o.type ?? null,
      mrr: o.mrr ?? null,
      recurrence_months: o.recurrence_months ?? null,
      tags: o.tags ?? null,
      enriched,
      enrichment: enrich
        ? { status: enrich.status ?? null, website_url: enrich.website_url ?? null }
        : null,
      project: project
        ? {
            id: project.id,
            pret_pour_lm: project.pret_pour_lm === true,
            enrichment_validated: isValidated(project),
            statut: project.statut,
          }
        : null,
      site: site
        ? {
            id: site.id,
            name: site.name ?? null,
            build_stage: site.build_stage ?? "a_faire",
            is_published: site.is_published === true,
            url: siteUrl(site),
            is_claude_design: site.is_claude_design === true,
          }
        : null,
      audit: audit ? { id: audit.id, statut: audit.statut ?? "draft", pdf_url: audit.pdf_url ?? null } : null,
      agent: owner ? { id: owner.id, name: owner.name } : null,
      column,
    };
  });

  const pipelines = ((pipelinesRes.data ?? []) as Array<{ id: string; nom: string | null; ordre: number | null; is_default: boolean | null }>).map(
    (p) => ({ id: p.id, nom: p.nom ?? "Pipeline", is_default: p.is_default === true }),
  );

  return json({ items, templates, agents, pipelines, has_validated_column: hasValidatedColumn });
});
