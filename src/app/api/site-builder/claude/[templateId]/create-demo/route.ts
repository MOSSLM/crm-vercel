import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { cloneTemplateSite } from "@/lib/site-builder/clone-template-site";

export const dynamic = "force-dynamic";

type Params = { templateId: string };

/**
 * POST /api/site-builder/claude/[templateId]/create-demo   (JSON: { companyId })
 *
 * Creates ONE demo site for a company by cloning a Claude Design template,
 * WITHOUT publishing — it lands in the kanban "À faire" column, pre-filled with
 * the company's variables, ready to be controlled then deployed. This is the
 * action behind dragging a "prêt pour LM" company into À faire.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json().catch(() => ({}));
  const companyId = Number((body as { companyId?: unknown }).companyId);
  if (!Number.isFinite(companyId)) return jsonError("companyId requis", 400);

  const supabase = getServiceClient();

  // Resolve the company name + its lead-magnet project (reviews source).
  const [{ data: company }, { data: project }] = await Promise.all([
    supabase.from("entreprises").select("id, name").eq("id", companyId).single(),
    supabase
      .from("lead_magnet_projects")
      .select("id")
      .eq("entreprise_id", companyId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (!company) return jsonError("Entreprise introuvable", 404);

  const clone = await cloneTemplateSite(supabase, params.templateId, {
    enterpriseId: companyId,
    name: (company as { name?: string }).name || `Site ${companyId}`,
    leadMagnetProjectId: (project as { id?: string } | null)?.id ?? null,
    buildStage: "a_faire",
  });
  if (!clone.ok || !clone.siteId) return jsonError(clone.error ?? "Clonage échoué", 500);

  return json({ siteId: clone.siteId }, { status: 201 });
});
