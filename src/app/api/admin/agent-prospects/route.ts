import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN || "samadigitalstudio.fr";

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

  const entIds = (ents ?? []).map((e) => e.id as number);
  if (entIds.length === 0) return json({ prospects: [] }, { headers: cors });

  const { data: opps } = await sc
    .from("opportunites")
    .select("id, entreprise_id")
    .in("entreprise_id", entIds);
  const oppIds = (opps ?? []).map((o) => o.id as string);
  const entByOpp = new Map((opps ?? []).map((o) => [o.id as string, o.entreprise_id as number]));

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

  const prospects = (ents ?? []).map((e) => {
    const audit = auditByEnt.get(e.id as number);
    const site = siteByEnt.get(e.id as number);
    return {
      id: e.id,
      name: e.name,
      ville: e.ville,
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

  return json({ prospects }, { headers: cors });
});
