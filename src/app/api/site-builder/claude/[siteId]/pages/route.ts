import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import type { SitemapPage } from "@/types";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

interface LibraryRef { theme_slug: string; section_id: string }

/**
 * GET  → the editable pages of a Claude Design site: per page_slug the tokenised
 *        body HTML, its service tag (from the sitemap) and current inline
 *        __overrides. Powers the dedicated builder preview + inline editing.
 */
export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const [{ data: site, error: sErr }, { data: instances, error: iErr }] = await Promise.all([
    supabase.from("sites").select("sitemap, shared_assets, tweaks, name, is_template, enterprise_id, published_subdomain").eq("id", params.siteId).single(),
    supabase
      .from("site_section_instances")
      .select("id, page_slug, content")
      .eq("site_id", params.siteId)
      .order("page_slug"),
  ]);
  if (iErr) return jsonError(iErr.message, 500);
  // Surface the site-query error instead of silently degrading (a missing
  // column used to blank shared_assets → no CSS in the editor).
  if (sErr || !site) return jsonError(sErr?.message ?? "Site introuvable", sErr ? 500 : 404);

  // A company-linked demo auto-applies its company in the builder — surface the
  // company name so the editor can select it without loading the full list.
  const enterpriseId = (site as { enterprise_id?: number | null } | null)?.enterprise_id ?? null;
  let enterpriseName: string | null = null;
  if (enterpriseId != null) {
    const { data: ent } = await supabase.from("entreprises").select("name").eq("id", enterpriseId).maybeSingle();
    enterpriseName = (ent as { name?: string } | null)?.name ?? null;
  }

  const sharedAssets = (site as { shared_assets?: Record<string, unknown> }).shared_assets ?? {};
  const sitemap = ((site as { sitemap?: SitemapPage[] } | null)?.sitemap ?? []) as SitemapPage[];
  const tagBySlug = new Map(sitemap.map((p) => [p.slug, p.service_tag ?? null]));
  const titleBySlug = new Map(sitemap.map((p) => [p.slug, p.title]));

  const insts = (instances ?? []) as Array<{ id: string; page_slug: string; content: Record<string, unknown> | null }>;
  const refBySlug = new Map<string, { instanceId: string; ref: LibraryRef; overrides: Record<string, unknown> }>();
  for (const inst of insts) {
    const ref = inst.content?.__library as LibraryRef | undefined;
    if (ref?.theme_slug === CLAUDE_DESIGN_THEME_SLUG) {
      refBySlug.set(inst.page_slug, {
        instanceId: inst.id,
        ref,
        overrides: (inst.content?.__overrides as Record<string, unknown>) ?? {},
      });
    }
  }

  const sectionIds = [...refBySlug.values()].map((v) => v.ref.section_id);
  const htmlBySection = new Map<string, string>();
  const jsBySection = new Map<string, string>();
  if (sectionIds.length > 0) {
    const { data: sections } = await supabase
      .from("theme_sections")
      .select("section_id, example_data")
      .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
      .in("section_id", sectionIds);
    for (const s of sections ?? []) {
      const ed = (s.example_data as Record<string, unknown> | null) ?? {};
      htmlBySection.set(s.section_id as string, (ed.__token_html as string) ?? "");
      jsBySection.set(s.section_id as string, (ed.__page_js as string) ?? "");
    }
  }

  const pages = [...refBySlug.entries()].map(([slug, v]) => ({
    slug,
    instanceId: v.instanceId,
    title: titleBySlug.get(slug) ?? slug,
    serviceTag: tagBySlug.get(slug) ?? null,
    html: htmlBySection.get(v.ref.section_id) ?? "",
    // The page's own runtime JS (its non-shared scripts); shared JS lives in
    // shared_assets.js. Both are injected into the editor preview iframe.
    pageJs: jsBySection.get(v.ref.section_id) ?? "",
    overrides: v.overrides,
  }));
  // index first.
  pages.sort((a, b) => (a.slug === "/" ? -1 : b.slug === "/" ? 1 : a.slug.localeCompare(b.slug)));

  return json({
    name: (site as { name?: string } | null)?.name ?? "",
    sharedAssets: sharedAssets,
    tweaks: (site as { tweaks?: unknown } | null)?.tweaks ?? {},
    // The Tweaks schema now lives inside shared_assets (no dedicated column).
    tweaksSchema: (sharedAssets as { tweaksSchema?: unknown })?.tweaksSchema ?? {},
    sitemap,
    pages,
    // Discriminators for the editor's contextual action button:
    // a template offers "Créer un template", a demo/project offers "Publier".
    isTemplate: (site as { is_template?: boolean | null } | null)?.is_template ?? false,
    enterpriseId,
    enterpriseName,
    publishedSubdomain: (site as { published_subdomain?: string | null } | null)?.published_subdomain ?? null,
  });
});

/**
 * PATCH → saves inline __overrides for one page instance.
 * Body: { instanceId, overrides }
 */
export const PATCH = withAuth<undefined, Params>({}, async ({ req }) => {
  const body = await req.json().catch(() => ({}));
  const instanceId = (body as { instanceId?: string }).instanceId;
  const overrides = (body as { overrides?: Record<string, unknown> }).overrides;
  if (!instanceId || typeof overrides !== "object") return jsonError("instanceId + overrides requis", 400);

  const supabase = getServiceClient();
  const { data: inst, error } = await supabase
    .from("site_section_instances")
    .select("content")
    .eq("id", instanceId)
    .single();
  if (error || !inst) return jsonError("Instance introuvable", 404);

  const content = { ...((inst.content as Record<string, unknown> | null) ?? {}), __overrides: overrides };
  const { error: updErr } = await supabase
    .from("site_section_instances")
    .update({ content })
    .eq("id", instanceId);
  if (updErr) return jsonError(updErr.message, 500);

  return json({ ok: true });
});
