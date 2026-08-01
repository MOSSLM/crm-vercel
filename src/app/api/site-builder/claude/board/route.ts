import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { isMissingColumn } from "@/lib/site-builder/clone-template-site";
import { splitClaudeSpaces } from "@/lib/site-builder/claude-spaces";

export const dynamic = "force-dynamic";

const BOARD_COLUMNS =
  "id, name, is_template, build_stage, published_subdomain, enterprise_id, paywall_enabled, updated_at";

/**
 * GET /api/site-builder/claude/board
 *
 * Data for the Claude Design projects kanban:
 *  - templates:     reusable Claude designs (is_template) to clone from, each
 *                   with the number of demo sites already made from it
 *  - demos:         company demo sites, with their build_stage, company name and
 *                   the template they were cloned from
 *  - readyCompanies: "prêt pour LM" companies that don't have a demo yet
 *                    (the pool you drag into "À faire")
 */
export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();

  // `source_template_id` (migration tardive) : sans lui le board reste utilisable,
  // il perd juste le rattachement démo → template. On retente sans plutôt que
  // de renvoyer une erreur.
  const loadSites = async () => {
    let columns = `${BOARD_COLUMNS}, source_template_id`;
    const query = () =>
      supabase
        .from("sites")
        .select(columns)
        .eq("is_claude_design", true)
        .order("updated_at", { ascending: false });
    let res = await query();
    if (res.error && isMissingColumn(res.error)) {
      columns = BOARD_COLUMNS;
      res = await query();
    }
    return res;
  };

  const [{ data: sites, error: sErr }, { data: readyProjects, error: pErr }] = await Promise.all([
    loadSites(),
    supabase
      .from("lead_magnet_projects")
      .select("entreprise_id")
      .eq("pret_pour_lm", true),
  ]);
  if (sErr) return jsonError(sErr.message, 500);
  if (pErr) return jsonError(pErr.message, 500);

  const allSites = (sites ?? []) as unknown as Array<{
    id: string; name: string; is_template: boolean | null; build_stage: string | null;
    published_subdomain: string | null; enterprise_id: number | null; paywall_enabled: boolean | null;
    source_template_id?: string | null;
  }>;

  // Même découpage que la page /site-builder : l'espace template d'un côté, les
  // démos qui en sortent de l'autre.
  const {
    templates: templateSites,
    demos,
    demoCountByTemplate,
    nameById: siteNameById,
  } = splitClaudeSpaces(allSites);
  const templates = templateSites.map((s) => ({
    id: s.id,
    name: s.name,
    demo_count: demoCountByTemplate[s.id] ?? 0,
  }));

  // Company names for demos + ready companies (one query).
  const demoCompanyIds = demos.map((d) => d.enterprise_id).filter((v): v is number => v != null);
  const readyIds = [...new Set((readyProjects ?? []).map((p) => p.entreprise_id as number).filter((v) => v != null))];
  const allCompanyIds = [...new Set([...demoCompanyIds, ...readyIds])];

  const companyNameById = new Map<number, string>();
  if (allCompanyIds.length > 0) {
    const { data: companies } = await supabase
      .from("entreprises")
      .select("id, name")
      .in("id", allCompanyIds);
    for (const c of companies ?? []) companyNameById.set(c.id as number, (c.name as string) ?? "");
  }

  // A ready company is "available" only if it doesn't already have a demo.
  const companiesWithDemo = new Set(demoCompanyIds);
  const readyCompanies = readyIds
    .filter((id) => !companiesWithDemo.has(id))
    .map((id) => ({ id, name: companyNameById.get(id) ?? `Entreprise ${id}` }));

  return json({
    templates,
    demos: demos.map((d) => ({
      id: d.id,
      name: d.name,
      build_stage: d.build_stage ?? "a_faire",
      published_subdomain: d.published_subdomain,
      enterprise_id: d.enterprise_id,
      paywall_enabled: d.paywall_enabled ?? false,
      company_name: d.enterprise_id != null ? companyNameById.get(d.enterprise_id) ?? null : null,
      // Le modèle dont cette démo est issue : c'est ce qui permet de voir, sur
      // le board, qu'une carte est partie du mauvais template.
      source_template_id: d.source_template_id ?? null,
      template_name: d.source_template_id ? siteNameById[d.source_template_id] ?? null : null,
    })),
    readyCompanies,
  });
});
