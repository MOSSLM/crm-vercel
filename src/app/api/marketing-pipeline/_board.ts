import { getServiceClient } from "@/app/api/_lib/service-client";
import { SITE_DOMAIN } from "@/lib/site-domain";

/**
 * Construction du tableau d'avancement Marketing & Web.
 *
 * Extrait de `board/route.ts` pour être partagé entre le board admin (toutes
 * les entreprises, 5 étapes dont l'attribution) et le board agent
 * (`ownerId` posé → seulement ses entreprises, 4 étapes, l'attribution ayant
 * déjà eu lieu en amont). Une seule implémentation, donc pas de dérive entre
 * les deux vues.
 */

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
  code_postal: string | null;
  telephone: string | null;
  service_tags: string[] | string | null;
  note_moyenne: number | string | null;
  nombre_avis: number | string | null;
  owner_id: string | null;
};

/**
 * Variables that must be present before a demo site can be generated cleanly
 * (the site templates render city, SEO city, postal code, phone, service tags
 * and review stats). Returns the human-readable labels missing.
 *
 * Must stay in sync with `SITE_REQUIRED` in MarketingWebPipeline.tsx — including
 * the rule that the SEO city is only required once a lead magnet project exists
 * (it lives on `lead_magnet_projects.override_city`).
 */
function missingForSite(ent: EntRow | undefined, project: ProjectRow | null | undefined): string[] {
  const miss: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "");
  if (!ent) return ["Entreprise"];
  if (!str(ent.name)) miss.push("Nom");
  if (!str(ent.ville)) miss.push("Ville");
  if (project && !str(project.override_city)) miss.push("Ville SEO");
  if (!str(ent.code_postal)) miss.push("Code postal");
  if (!str(ent.telephone)) miss.push("Téléphone");
  const tags = Array.isArray(ent.service_tags)
    ? ent.service_tags.filter((t) => typeof t === "string" && t.trim().length > 0)
    : str(ent.service_tags)
      ? [str(ent.service_tags)]
      : [];
  if (tags.length === 0) miss.push("Service tags");
  if (!(Number(ent.note_moyenne) > 0)) miss.push("Note moyenne");
  if (!(Number(ent.nombre_avis) > 0)) miss.push("Nombre d'avis");
  return miss;
}

type ProjectRow = {
  id: string;
  opportunite_id: string | null;
  entreprise_id: number | null;
  statut: string | null;
  pret_pour_lm: boolean | null;
  /** Ville SEO — requise pour créer un site (voir `missingForSite`). */
  override_city: string | null;
  enrichment_validated?: boolean | null;
};

type EnrichMetaRow = {
  id: string;
  enrichment_error: string | null;
  enrichment_attempts: number | null;
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

/**
 * Statuts d'`automated_enrichment` (ancien pipeline Production ›
 * Enrichissement) qui ne valent pas « enrichi ».
 */
const ENRICHMENT_FAIL_STATUSES = new Set(["pending", "queued", "running", "failed", "error"]);

/**
 * Statuts de `lead_magnet_projects` qui signent un enrichissement terminé :
 * l'edge function `enrich-lead-magnet` pose `framer` en fin de run réussi,
 * `ready`/`published` sont les états postérieurs (mêmes valeurs que
 * `TERMINAL_STATUSES` dans `enrich-prepare`).
 */
const PROJECT_ENRICHED_STATUSES = new Set(["framer", "ready", "published"]);

/**
 * L'étape « Enrichissement » est-elle franchie ? C'est ce booléen qui débloque
 * la carte « Validation données » côté matrice (`activeStageIndex`).
 *
 * Le signal qui compte est le **projet lead magnet** : c'est lui que
 * `/api/lead-magnet/enrich` fait tourner et que l'edge function passe à
 * `framer`. `automated_enrichment` appartient à l'ancien pipeline de production
 * et n'est jamais écrit par ce run — s'y fier seule laissait la ligne collée
 * sur la carte « Enrichir » après un enrichissement pourtant réussi, donc la
 * carte de validation restait verrouillée et il n'y avait rien à valider.
 *
 * @param project Projet lead magnet de l'opportunité (statut + validation
 *   humaine déjà résolue), `null` s'il n'y en a pas encore.
 * @param legacy Dernière ligne `automated_enrichment` de l'entreprise.
 */
export function isEnrichmentDone(
  project: { statut: string | null; validated: boolean } | null,
  legacy: { status: string | null } | null,
): boolean {
  // Déjà validé par un humain : l'étape ne régresse plus, même pendant un
  // ré-enrichissement (qui repasse le statut à `draft` le temps du run).
  if (project?.validated) return true;

  const statut = project?.statut ?? null;
  if (statut != null && PROJECT_ENRICHED_STATUSES.has(statut)) return true;

  // Run en échec : la carte « Enrichir » reste active pour porter le bouton
  // « Relancer » et le message d'erreur, quoi qu'en dise l'ancien pipeline.
  if (statut === "failed") return false;

  // Ancien pipeline : une fiche déjà enrichie hors marketing pipeline compte,
  // mais seulement s'il y a un projet — sinon la carte suivante s'ouvrirait sur
  // un bouton « Valider » inerte (il n'y a pas de projet à valider).
  if (project && legacy && !(legacy.status != null && ENRICHMENT_FAIL_STATUSES.has(legacy.status))) {
    return true;
  }

  return false;
}

function siteUrl(s: SiteRow | undefined): string | null {
  if (!s) return null;
  if (s.published_domain) {
    return s.published_domain.startsWith("http") ? s.published_domain : `https://${s.published_domain}`;
  }
  if (s.published_subdomain) return `https://${s.published_subdomain}.${SITE_DOMAIN}`;
  return null;
}

export type BoardResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number };

/**
 * Agrège, pour chaque opportunité liée à une entreprise, l'état du workflow de
 * production marketing : enrichissement → prêt pour LM → site démo → audit →
 * attribution d'un agent. Renvoie aussi les templates de site, les agents et
 * les pipelines.
 *
 * @param ownerId Restreint aux entreprises appartenant à cet agent. Omis côté
 *   admin, où le board est global.
 */
export async function buildBoard(opts: { ownerId?: string } = {}): Promise<BoardResult> {
  const supabase = getServiceClient();

  const empty = {
    items: [],
    templates: [],
    agents: [],
    pipelines: [],
    has_validated_column: true,
  };

  // Scope agent : on part des entreprises qui lui appartiennent, puis on ne
  // remonte que leurs opportunités.
  let ownedEntIds: number[] | null = null;
  if (opts.ownerId) {
    const { data, error } = await supabase
      .from("entreprises")
      .select("id")
      .eq("owner_id", opts.ownerId);
    if (error) return { ok: false, error: error.message, status: 500 };
    ownedEntIds = (data ?? []).map((e) => Number(e.id));
    if (ownedEntIds.length === 0) return { ok: true, data: empty };
  }

  let oppQuery = supabase
    .from("opportunites")
    .select(
      "id, entreprise_id, pipeline_id, name, montant, priorite, type, mrr, recurrence_months, tags, updated_at, created_at",
    )
    .not("entreprise_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(OPPORTUNITY_LIMIT);

  if (ownedEntIds) oppQuery = oppQuery.in("entreprise_id", ownedEntIds);

  const { data: oppsData, error: oppErr } = await oppQuery;
  if (oppErr) return { ok: false, error: oppErr.message, status: 500 };

  const opps = (oppsData ?? []) as OppRow[];
  const oppIds = opps.map((o) => o.id);
  const entIds = [...new Set(opps.map((o) => o.entreprise_id).filter((v): v is number => v != null))];

  if (opps.length === 0) return { ok: true, data: empty };

  // The explicit human-validation flag lives in a column added by a later
  // migration; degrade to `pret_pour_lm` when it isn't there yet.
  let hasValidatedColumn = true;
  let projectRows: ProjectRow[] = [];
  {
    const withCol = await supabase
      .from("lead_magnet_projects")
      .select("id, opportunite_id, entreprise_id, statut, pret_pour_lm, override_city, enrichment_validated")
      .in("opportunite_id", oppIds);
    if (withCol.error) {
      hasValidatedColumn = false;
      const withoutCol = await supabase
        .from("lead_magnet_projects")
        .select("id, opportunite_id, entreprise_id, statut, pret_pour_lm, override_city")
        .in("opportunite_id", oppIds);
      if (withoutCol.error) return { ok: false, error: withoutCol.error.message, status: 500 };
      projectRows = (withoutCol.data ?? []) as ProjectRow[];
    } else {
      projectRows = (withCol.data ?? []) as ProjectRow[];
    }
  }

  const [entsRes, enrichRes, sitesRes, auditsRes, agentsRes, pipelinesRes] = await Promise.all([
    supabase
      .from("entreprises")
      .select(
        "id, name, canonical_url, site_web_canonique, logo_url, ville, code_postal, telephone, service_tags, note_moyenne, nombre_avis, owner_id",
      )
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

  if (entsRes.error) return { ok: false, error: entsRes.error.message, status: 500 };
  if (sitesRes.error) return { ok: false, error: sitesRes.error.message, status: 500 };

  // Enrichment run metadata (statut/error/attempts written by the edge function).
  // These columns are optional: the board degrades gracefully if a DB predates
  // them, exactly like `enrichment_validated` above.
  const enrichMetaById = new Map<string, EnrichMetaRow>();
  {
    const projectIds = projectRows.map((p) => p.id);
    if (projectIds.length > 0) {
      const metaRes = await supabase
        .from("lead_magnet_projects")
        .select("id, enrichment_error, enrichment_attempts")
        .in("id", projectIds);
      if (!metaRes.error) {
        for (const row of (metaRes.data ?? []) as EnrichMetaRow[]) enrichMetaById.set(row.id, row);
      }
    }
  }

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
  for (const r of (enrichRes.data ?? []) as EnrichRow[]) {
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
  for (const a of (auditsRes.data ?? []) as AuditRow[]) {
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

    const enriched = isEnrichmentDone(
      project ? { statut: project.statut, validated: isValidated(project) } : null,
      enrich ? { status: enrich.status } : null,
    );

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
            enrichment_error: enrichMetaById.get(project.id)?.enrichment_error ?? null,
            enrichment_attempts: enrichMetaById.get(project.id)?.enrichment_attempts ?? null,
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
      missing_for_site: missingForSite(ent, project),
      column,
    };
  });

  const pipelines = (
    (pipelinesRes.data ?? []) as Array<{
      id: string;
      nom: string | null;
      ordre: number | null;
      is_default: boolean | null;
    }>
  ).map((p) => ({ id: p.id, nom: p.nom ?? "Pipeline", is_default: p.is_default === true }));

  return {
    ok: true,
    data: {
      items,
      templates,
      // Le board agent n'attribue pas : la liste des agents ne lui sert à rien.
      agents: opts.ownerId ? [] : agents,
      pipelines,
      has_validated_column: hasValidatedColumn,
    },
  };
}
