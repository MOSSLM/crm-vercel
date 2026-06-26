import { revalidatePath } from "next/cache";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { publishSite } from "@/lib/site-builder/publish-site";
import { deriveSubdomainLabel, uniqueSubdomain } from "@/lib/site-builder/derive-subdomain";
import { cloneTemplateSite, type TemplateSlice, type TemplateInstance } from "@/lib/site-builder/clone-template-site";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

interface DeployResult {
  entreprise_id: number;
  ok: boolean;
  site_id?: string;
  subdomain?: string;
  url?: string;
  error?: string;
}

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "samadigitalstudio.fr";

/**
 * Bulk-creates company demo sites from a template site (siteId) and publishes
 * each immediately. For every selected company: clone the template's config +
 * section instances, link the enterprise + its lead-magnet project, derive a
 * unique demo subdomain from the company URL, then publish. Per-company errors
 * are captured so one failure doesn't abort the batch.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  const templateId = params.siteId;

  const body = await req.json().catch(() => ({}));
  const companyIds = Array.isArray((body as { companyIds?: unknown }).companyIds)
    ? ((body as { companyIds: unknown[] }).companyIds.filter((v) => typeof v === "number") as number[])
    : [];
  if (companyIds.length === 0) return jsonError("companyIds[] requis", 400);

  // 1) Load the template site + its instances.
  const [{ data: template, error: tErr }, { data: templateInstances, error: iErr }] = await Promise.all([
    supabase
      .from("sites")
      .select("style_guide, sitemap, site_config, content_overrides, shared_assets, tweaks, is_claude_design")
      .eq("id", templateId)
      .single(),
    supabase
      .from("site_section_instances")
      .select("section_id, page_slug, sort_order, content, blocks, custom_style, is_hidden")
      .eq("site_id", templateId),
  ]);
  if (tErr || !template) return jsonError("Template introuvable", 404);
  if (iErr) return jsonError(iErr.message, 500);

  // 2) Resolve companies + their enriched lead-magnet projects in bulk.
  const [{ data: companies }, { data: projects }, { data: existing }] = await Promise.all([
    supabase.from("entreprises").select("id, nom:name, canonical_url, site_web_canonique").in("id", companyIds),
    supabase.from("lead_magnet_projects").select("id, entreprise_id").eq("pret_pour_lm", true).in("entreprise_id", companyIds),
    supabase.from("sites").select("published_subdomain").not("published_subdomain", "is", null),
  ]);

  const companyMap = new Map<number, { nom: string; canonical_url: string | null; site_web_canonique: string | null }>();
  for (const c of companies ?? []) {
    companyMap.set(c.id as number, {
      nom: (c.nom as string) ?? "",
      canonical_url: (c.canonical_url as string | null) ?? null,
      site_web_canonique: (c.site_web_canonique as string | null) ?? null,
    });
  }
  const projectByCompany = new Map<number, string>();
  for (const p of projects ?? []) {
    if (p.entreprise_id != null && !projectByCompany.has(p.entreprise_id as number)) {
      projectByCompany.set(p.entreprise_id as number, p.id as string);
    }
  }
  const takenSubdomains = new Set<string>(
    (existing ?? []).map((s) => (s.published_subdomain as string)).filter(Boolean),
  );

  const tpl = template as unknown as TemplateSlice;
  const tplInstances = (templateInstances ?? []) as TemplateInstance[];

  const results: DeployResult[] = [];

  // 3) Process sequentially so subdomain uniqueness + per-item errors are clean.
  for (const entrepriseId of companyIds) {
    const company = companyMap.get(entrepriseId);
    if (!company) {
      results.push({ entreprise_id: entrepriseId, ok: false, error: "Entreprise introuvable" });
      continue;
    }
    try {
      const label = uniqueSubdomain(
        deriveSubdomainLabel(company.canonical_url ?? company.site_web_canonique, company.nom),
        takenSubdomains,
      );
      takenSubdomains.add(label); // reserve within this batch

      // Clone the template (config + instances + shared assets/theme) via the
      // shared helper, reusing the batch-loaded template to avoid re-querying.
      const clone = await cloneTemplateSite(supabase, templateId, {
        enterpriseId: entrepriseId,
        name: company.nom || `Site ${entrepriseId}`,
        leadMagnetProjectId: projectByCompany.get(entrepriseId) ?? null,
        preloaded: { template: tpl, instances: tplInstances },
      });
      if (!clone.ok || !clone.siteId) throw new Error(clone.error ?? "Clonage échoué");
      const newSiteId = clone.siteId;

      // Publish the demo immediately on the derived subdomain.
      const pub = await publishSite(supabase, newSiteId, { subdomain: label });
      if (!pub.ok) throw new Error(pub.error ?? "Publication échouée");
      try { revalidatePath(`/site/${label}`, "layout"); } catch {}

      results.push({
        entreprise_id: entrepriseId,
        ok: true,
        site_id: newSiteId,
        subdomain: label,
        url: `https://${label}.${SITE_DOMAIN}`,
      });
    } catch (e) {
      results.push({ entreprise_id: entrepriseId, ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  }

  return json({ results });
});
