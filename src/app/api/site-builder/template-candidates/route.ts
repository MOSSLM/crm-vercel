import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

/**
 * Lists LM-ready companies that match a template's service tags, for the bulk
 * "Créer site web" action in the template settings.
 *
 * A candidate is a qualified enterprise that has an enriched lead-magnet
 * project (lead_magnet_projects.pret_pour_lm = true) and — when a `?tags=`
 * filter is given — shares at least one service tag with the template.
 */
export const GET = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const url = new URL(req.url);
  const tagsParam = url.searchParams.get("tags") ?? "";
  const wantedTags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);

  // Enriched (LM-ready) projects gate which companies are deployable.
  const { data: projects, error: projErr } = await supabase
    .from("lead_magnet_projects")
    .select("id, entreprise_id, opportunite_id")
    .eq("pret_pour_lm", true);
  if (projErr) return jsonError(projErr.message, 500);

  const projList = (projects ?? []).filter((p) => p.entreprise_id != null) as Array<{
    id: string; entreprise_id: number; opportunite_id: string | null;
  }>;
  if (projList.length === 0) return json([]);

  // One project per company (each enterprise has at most one).
  const byCompany = new Map<number, { id: string; opportunite_id: string | null }>();
  for (const p of projList) {
    if (!byCompany.has(p.entreprise_id)) byCompany.set(p.entreprise_id, { id: p.id, opportunite_id: p.opportunite_id });
  }
  const companyIds = Array.from(byCompany.keys());

  const { data: companies, error: compErr } = await supabase
    .from("entreprises")
    .select("id, nom:name, service_tags, canonical_url, site_web_canonique")
    .eq("qualifie", true)
    .in("id", companyIds);
  if (compErr) return jsonError(compErr.message, 500);

  const norm = (t: string) => t.trim().toLowerCase();
  const wantedSet = new Set(wantedTags.map(norm));

  const result = (companies ?? [])
    .map((c) => {
      const tags = Array.isArray(c.service_tags) ? (c.service_tags as string[]) : [];
      const matched = wantedSet.size === 0 ? tags : tags.filter((t) => wantedSet.has(norm(t)));
      const proj = byCompany.get(c.id as number)!;
      return {
        id: c.id as number,
        nom: c.nom as string,
        service_tags: tags,
        matched_tags: matched,
        canonical_url: (c.canonical_url as string | null) ?? null,
        site_web_canonique: (c.site_web_canonique as string | null) ?? null,
        lead_magnet_project_id: proj.id,
        opportunite_id: proj.opportunite_id,
      };
    })
    // Require >=1 matching service tag when a template tag filter is provided.
    .filter((c) => wantedSet.size === 0 || c.matched_tags.length > 0)
    .sort((a, b) => (b.matched_tags.length - a.matched_tags.length) || a.nom.localeCompare(b.nom));

  return json(result);
});
