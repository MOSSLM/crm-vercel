import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clones a template site into a new company site (config + style guide + sitemap
 * + shared assets/theme + every section instance), WITHOUT publishing. Shared by
 * the bulk `deploy-batch` route and the kanban "create demo" action so the clone
 * logic lives in one place.
 *
 * The caller may pass a preloaded template + instances (deploy-batch loads them
 * once for the whole batch); otherwise this loads them itself.
 */

export interface TemplateSlice {
  style_guide: unknown;
  sitemap: unknown;
  site_config: unknown;
  content_overrides: unknown;
  shared_assets: unknown;
  tweaks: unknown;
  tweaks_schema: unknown;
  is_claude_design: boolean | null;
}

export interface TemplateInstance {
  section_id: string | null;
  page_slug: string;
  sort_order: number;
  content: Record<string, unknown> | null;
  blocks: unknown;
  custom_style: unknown;
  is_hidden: boolean | null;
}

const TEMPLATE_COLUMNS =
  "style_guide, sitemap, site_config, content_overrides, shared_assets, tweaks, tweaks_schema, is_claude_design";
const INSTANCE_COLUMNS =
  "section_id, page_slug, sort_order, content, blocks, custom_style, is_hidden";

export interface CloneTemplateOptions {
  /** Linked company for a demo site; null/0 when duplicating as a template. */
  enterpriseId?: number | null;
  name: string;
  leadMagnetProjectId?: string | null;
  /** Kanban stage for the new demo. Defaults to 'a_faire'. */
  buildStage?: "a_faire" | "en_cours" | "a_verifier" | "pret";
  /** Duplicate as a reusable TEMPLATE (is_template=true, no company) instead of a demo. */
  asTemplate?: boolean;
  /** Avoid re-querying when the caller already loaded the template (bulk path). */
  preloaded?: { template: TemplateSlice; instances: TemplateInstance[] };
}

export interface CloneTemplateResult {
  ok: boolean;
  siteId?: string;
  error?: string;
}

export async function cloneTemplateSite(
  supabase: SupabaseClient,
  templateId: string,
  opts: CloneTemplateOptions,
): Promise<CloneTemplateResult> {
  let template = opts.preloaded?.template;
  let instances = opts.preloaded?.instances;

  if (!template || !instances) {
    const [{ data: tpl, error: tErr }, { data: inst, error: iErr }] = await Promise.all([
      supabase.from("sites").select(TEMPLATE_COLUMNS).eq("id", templateId).single(),
      supabase.from("site_section_instances").select(INSTANCE_COLUMNS).eq("site_id", templateId),
    ]);
    if (tErr || !tpl) return { ok: false, error: "Template introuvable" };
    if (iErr) return { ok: false, error: iErr.message };
    template = tpl as unknown as TemplateSlice;
    instances = (inst ?? []) as TemplateInstance[];
  }

  const { data: newSite, error: insErr } = await supabase
    .from("sites")
    .insert({
      name: opts.name,
      enterprise_id: opts.asTemplate ? null : (opts.enterpriseId ?? null),
      lead_magnet_project_id: opts.asTemplate ? null : (opts.leadMagnetProjectId ?? null),
      is_template: opts.asTemplate ?? false,
      is_claude_design: template.is_claude_design ?? false,
      build_stage: opts.buildStage ?? "a_faire",
      style_guide: template.style_guide ?? null,
      sitemap: template.sitemap ?? null,
      site_config: template.site_config ?? null,
      content_overrides: template.content_overrides ?? null,
      shared_assets: template.shared_assets ?? {},
      tweaks: template.tweaks ?? {},
      tweaks_schema: template.tweaks_schema ?? {},
    })
    .select("id")
    .single();
  if (insErr || !newSite) return { ok: false, error: insErr?.message ?? "Création du site échouée" };
  const newSiteId = (newSite as { id: string }).id;

  if (instances.length > 0) {
    const cloned = instances.map((inst) => ({
      id: crypto.randomUUID(),
      site_id: newSiteId,
      section_id: inst.section_id ?? null,
      page_slug: inst.page_slug,
      sort_order: inst.sort_order,
      content: structuredClone(inst.content ?? {}),
      blocks: structuredClone(inst.blocks ?? []),
      custom_style: structuredClone(inst.custom_style ?? {}),
      is_hidden: inst.is_hidden ?? false,
    }));
    const { error: cloneErr } = await supabase.from("site_section_instances").insert(cloned);
    if (cloneErr) {
      await supabase.from("sites").delete().eq("id", newSiteId);
      return { ok: false, error: cloneErr.message };
    }
  }

  return { ok: true, siteId: newSiteId };
}
