import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { wrapRawHtml } from "@/lib/site-builder/wrap-raw-html";
import { CLAUDE_DESIGN_THEME_SLUG } from "@/lib/site-builder/create-claude-design";
import { applyBracketTokens, type BracketMappingEntry } from "@/lib/site-builder/claude-design/bracket-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { siteId: string };

interface LibraryRef {
  theme_slug: string;
  section_id: string;
}

/**
 * POST /api/site-builder/designs/[siteId]/mapping   (JSON: { mapping: [...] })
 *
 * Re-applies a corrected bracket→token mapping to every raw page of a Claude
 * Design site: for each page it re-tokenises the stored `__source_html` (the
 * rewritten-but-still-bracketed source) and rewrites `theme_sections.code`.
 * Deterministic counterpart of the AI `tokenize` route — lets the review UI fix
 * mis-detected variables without re-uploading.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  let body: { mapping?: BracketMappingEntry[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }
  const mapping = Array.isArray(body.mapping) ? body.mapping : [];
  if (mapping.length === 0) return jsonError("mapping[] requis.", 400);

  const supabase = getServiceClient();

  // 1) Collect the design's library section refs from its instances.
  const { data: instances, error: instErr } = await supabase
    .from("site_section_instances")
    .select("content")
    .eq("site_id", params.siteId);
  if (instErr) return jsonError(instErr.message, 500);

  const sectionIds: string[] = [];
  const seen = new Set<string>();
  for (const inst of instances ?? []) {
    const ref = (inst.content as Record<string, unknown> | null)?.__library as LibraryRef | undefined;
    if (!ref || ref.theme_slug !== CLAUDE_DESIGN_THEME_SLUG) continue;
    if (!seen.has(ref.section_id)) { seen.add(ref.section_id); sectionIds.push(ref.section_id); }
  }
  if (sectionIds.length === 0) return jsonError("Aucun design Claude sur ce site.", 404);

  // 2) Load the matching sections (with their un-tokenised source HTML).
  const { data: sections, error: secErr } = await supabase
    .from("theme_sections")
    .select("id, example_data")
    .eq("theme_slug", CLAUDE_DESIGN_THEME_SLUG)
    .in("section_id", sectionIds);
  if (secErr) return jsonError(secErr.message, 500);

  let totalApplied = 0;
  for (const section of sections ?? []) {
    const exampleData = (section.example_data as Record<string, unknown> | null) ?? {};
    const sourceHtml = exampleData.__source_html;
    if (typeof sourceHtml !== "string" || !sourceHtml.trim()) continue;

    const result = applyBracketTokens(sourceHtml, mapping);
    totalApplied += result.applied.reduce((n, a) => n + a.count, 0);

    const { error: updErr } = await supabase
      .from("theme_sections")
      .update({
        code: wrapRawHtml(result.html),
        example_data: { ...exampleData, __token_html: result.html, __var_mapping: result.applied },
      })
      .eq("id", section.id);
    if (updErr) return jsonError(updErr.message, 500);
  }

  return json({ ok: true, sections: (sections ?? []).length, replaced: totalApplied });
});
