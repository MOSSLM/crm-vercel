import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { coerceThemeSets } from "@/lib/site-builder/claude-design/parse-theme-sets";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { siteId: string };

/**
 * POST /api/site-builder/designs/[siteId]/theme-sets   (JSON)
 *
 * Repairs the THEME of an already-imported Claude Design, without touching a
 * single page.
 *
 * `shared_assets.themeSets` holds the skin's own font/weight/corner tables, read
 * from its `theme-apply.js` (see parse-theme-sets.ts). Designs imported before
 * that existed have the slot empty, so `apply-tweaks` falls back to the FIRST
 * design's tables: a "Brut" template renders Classique's typeface, and picking
 * "Chantier" in the panel changes nothing. Re-importing would fix it, but it
 * would also rewrite the markup and re-upload every image to change one JSONB
 * key — this route exists so that isn't the only option.
 *
 * Strictly additive: it merges the provided keys into `shared_assets` and never
 * touches `css`, `js`, `scriptLinks`, `tweaks`, `theme_sections` or
 * `site_section_instances`. Nothing here can lose work, which is why — unlike
 * `import-pages` — it takes no backup and asks for no confirmation.
 *
 * `fontLinks` is accepted because the pre-fix update path UNIONED the font list
 * instead of replacing it: a template that went through one carries the Google
 * families of several skins at once. Rewriting the list prunes them.
 *
 * Body: { themeSets, tweaksSchema?, fontLinks? }
 * → { ok: true, updated: string[] }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: {
    themeSets?: unknown;
    tweaksSchema?: Record<string, unknown>;
    fontLinks?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  // Validate before writing: storing an unusable table would silently keep the
  // wrong typeface while reporting success.
  const themeSets = coerceThemeSets(body.themeSets);
  const hasSchema = !!body.tweaksSchema && typeof body.tweaksSchema === "object";
  const hasFonts = Array.isArray(body.fontLinks);
  if (!themeSets && !hasSchema && !hasFonts) {
    return jsonError("Rien à réparer : aucune table de thème exploitable dans ce ZIP.", 422);
  }

  const supabase = getServiceClient();
  const { data: site, error: sErr } = await supabase
    .from("sites")
    .select("shared_assets, is_claude_design")
    .eq("id", siteId)
    .single();
  if (sErr || !site) return jsonError(sErr?.message ?? "Template introuvable.", sErr ? 500 : 404);
  if (!(site as { is_claude_design?: boolean | null }).is_claude_design) {
    return jsonError("Ce site n'est pas un design Claude multi-pages.", 400);
  }

  const shared = ((site as { shared_assets?: Record<string, unknown> | null }).shared_assets ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...shared };
  const updated: string[] = [];
  if (themeSets) { merged.themeSets = themeSets; updated.push("themeSets"); }
  if (hasSchema) { merged.tweaksSchema = body.tweaksSchema; updated.push("tweaksSchema"); }
  if (hasFonts) { merged.fonts = body.fontLinks; updated.push("fonts"); }

  const { error: upErr } = await supabase.from("sites").update({ shared_assets: merged }).eq("id", siteId);
  if (upErr) return jsonError(upErr.message, 500);

  invalidateSiteCache(siteId);
  return json({ ok: true, updated });
});
