import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { cloneTemplateSite } from "@/lib/site-builder/clone-template-site";
import { resolveLeadMagnetProjectId } from "@/lib/site-builder/resolve-project-id";

export const dynamic = "force-dynamic";

// The dynamic segment is named [siteId] to match the sibling [siteId]/pages
// route (Next.js forbids two slug names at the same path level). The value
// carried here is the TEMPLATE site's id.
type Params = { siteId: string };

/**
 * POST /api/site-builder/claude/[siteId]/create-demo   (JSON: { companyId })
 *   ([siteId] = the template's id)
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

  // Resolve the company name + its lead-magnet project (reviews source), and
  // the template's own name — echoed back so the caller can SHOW which template
  // the demo was actually cloned from instead of trusting its own dropdown.
  const [{ data: company }, project, { data: template }] = await Promise.all([
    supabase.from("entreprises").select("id, name").eq("id", companyId).single(),
    // Résolveur partagé : une entreprise a un projet par opportunité, et c'est
    // ce lien qui décidera plus tard des chiffres clés affichés sur la démo.
    resolveLeadMagnetProjectId(supabase, { enterpriseId: companyId }),
    supabase.from("sites").select("name").eq("id", params.siteId).maybeSingle(),
  ]);
  if (!company) return jsonError("Entreprise introuvable", 404);

  const clone = await cloneTemplateSite(supabase, params.siteId, {
    enterpriseId: companyId,
    name: (company as { name?: string }).name || `Site ${companyId}`,
    leadMagnetProjectId: project.projectId,
    buildStage: "a_faire",
  });
  if (!clone.ok || !clone.siteId) return jsonError(clone.error ?? "Clonage échoué", 500);

  return json(
    {
      siteId: clone.siteId,
      templateId: params.siteId,
      templateName: (template as { name?: string } | null)?.name ?? null,
    },
    { status: 201 },
  );
});
