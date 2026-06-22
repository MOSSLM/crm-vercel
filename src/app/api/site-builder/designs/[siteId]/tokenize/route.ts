import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { wrapRawHtml } from "@/lib/site-builder/wrap-raw-html";
import { tokenizeDesign, type DesignReplacement } from "@/lib/ai/tokenize-design";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { siteId: string };

interface LibraryRef {
  theme_slug: string;
  section_id: string;
}

/**
 * POST /api/site-builder/designs/[siteId]/tokenize
 *
 * Runs the AI variable-detection pass over the site's imported design(s),
 * rewrites each raw section's code with `{{ entreprise.* }}` tokens, and
 * returns the applied mapping for human review. Auto-detection per the agreed
 * UX ("détection auto + relecture").
 */
export const POST = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  // 1) Collect the design's library section refs from its instances.
  const { data: instances, error: instErr } = await supabase
    .from("site_section_instances")
    .select("content")
    .eq("site_id", params.siteId);
  if (instErr) return jsonError(instErr.message, 500);

  const refs: LibraryRef[] = [];
  const seen = new Set<string>();
  for (const inst of instances ?? []) {
    const ref = (inst.content as Record<string, unknown> | null)?.__library as LibraryRef | undefined;
    if (!ref || ref.theme_slug !== CLAUDE_DESIGN_THEME_SLUG) continue;
    const key = `${ref.theme_slug}:${ref.section_id}`;
    if (!seen.has(key)) { seen.add(key); refs.push(ref); }
  }
  if (refs.length === 0) {
    return jsonError("Aucun design Claude à analyser sur ce site.", 404);
  }

  // 2) Load the matching sections (with their un-tokenised source HTML).
  const { data: sections, error: secErr } = await supabase
    .from("theme_sections")
    .select("id, section_id, example_data")
    .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
    .in("section_id", refs.map((r) => r.section_id));
  if (secErr) return jsonError(secErr.message, 500);

  const aggregated: Array<DesignReplacement & { count: number }> = [];

  for (const section of sections ?? []) {
    const exampleData = (section.example_data as Record<string, unknown> | null) ?? {};
    const sourceHtml = exampleData.__source_html;
    if (typeof sourceHtml !== "string" || !sourceHtml.trim()) continue;

    let result;
    try {
      result = await tokenizeDesign(sourceHtml);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Erreur IA", 502);
    }

    const { error: updErr } = await supabase
      .from("theme_sections")
      .update({
        code: wrapRawHtml(result.html),
        example_data: { ...exampleData, __var_mapping: result.mapping },
      })
      .eq("id", section.id);
    if (updErr) return jsonError(updErr.message, 500);

    aggregated.push(...result.mapping);
  }

  return json({ mapping: aggregated, sections: (sections ?? []).length });
});
