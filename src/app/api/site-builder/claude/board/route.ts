import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/site-builder/claude/board
 *
 * Data for the Claude Design projects kanban:
 *  - templates:     reusable Claude designs (is_template) to clone from
 *  - demos:         company demo sites, with their build_stage + company name
 *  - readyCompanies: "prêt pour LM" companies that don't have a demo yet
 *                    (the pool you drag into "À faire")
 */
export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();

  const [{ data: sites, error: sErr }, { data: readyProjects, error: pErr }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, is_template, build_stage, published_subdomain, enterprise_id, updated_at")
      .eq("is_claude_design", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("lead_magnet_projects")
      .select("entreprise_id")
      .eq("pret_pour_lm", true),
  ]);
  if (sErr) return jsonError(sErr.message, 500);
  if (pErr) return jsonError(pErr.message, 500);

  const allSites = (sites ?? []) as Array<{
    id: string; name: string; is_template: boolean | null; build_stage: string | null;
    published_subdomain: string | null; enterprise_id: number | null;
  }>;

  const templates = allSites.filter((s) => s.is_template).map((s) => ({ id: s.id, name: s.name }));
  const demos = allSites.filter((s) => !s.is_template);

  // Company names for demos + ready companies (one query).
  const demoCompanyIds = demos.map((d) => d.enterprise_id).filter((v): v is number => v != null);
  const readyIds = [...new Set((readyProjects ?? []).map((p) => p.entreprise_id as number).filter((v) => v != null))];
  const allCompanyIds = [...new Set([...demoCompanyIds, ...readyIds])];

  const nameById = new Map<number, string>();
  if (allCompanyIds.length > 0) {
    const { data: companies } = await supabase
      .from("entreprises")
      .select("id, name")
      .in("id", allCompanyIds);
    for (const c of companies ?? []) nameById.set(c.id as number, (c.name as string) ?? "");
  }

  // A ready company is "available" only if it doesn't already have a demo.
  const companiesWithDemo = new Set(demoCompanyIds);
  const readyCompanies = readyIds
    .filter((id) => !companiesWithDemo.has(id))
    .map((id) => ({ id, name: nameById.get(id) ?? `Entreprise ${id}` }));

  return json({
    templates,
    demos: demos.map((d) => ({
      id: d.id,
      name: d.name,
      build_stage: d.build_stage ?? "a_faire",
      published_subdomain: d.published_subdomain,
      enterprise_id: d.enterprise_id,
      company_name: d.enterprise_id != null ? nameById.get(d.enterprise_id) ?? null : null,
    })),
    readyCompanies,
  });
});
