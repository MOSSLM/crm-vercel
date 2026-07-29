import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INSTANCE_COLUMNS,
  TEMPLATE_COLUMNS,
  isMissingColumn,
  type TemplateInstance,
  type TemplateSlice,
} from "./clone-template-site";
import { publishSite } from "./publish-site";

/**
 * Refait un site de démo EXISTANT à partir d'un template — le même qu'avant
 * (simple rafraîchissement) ou un autre (changement de modèle).
 *
 * Pourquoi une reconstruction en place plutôt qu'un nouveau clone : « refaire le
 * site » créait jusqu'ici une démo de plus, et le board continuait d'afficher
 * l'ancienne (il retient le site le plus avancé de l'entreprise). Le changement
 * de template semblait donc sans effet, et les URLs déjà envoyées à un prospect
 * pointaient toujours sur l'ancien rendu. En gardant l'id du site, on conserve
 * le sous-domaine publié, le lien de l'audit et l'avancement de la ligne.
 *
 * Les variables (ville, stats, logo, avis…) ne sont pas figées dans le site :
 * elles sont résolues au rendu depuis `entreprises` / `lead_magnet_projects`.
 * Une fiche corrigée à la main est donc reprise automatiquement — sauf sur un
 * site DÉJÀ PUBLIÉ, qui sert un instantané ; d'où la republication ci-dessous,
 * qui rafraîchit cet instantané avec les données du moment.
 *
 * Contrepartie assumée : les retouches faites dans l'éditeur sur ce site
 * (overrides d'instances) sont perdues — on repart du modèle.
 */

export interface RebuildSiteResult {
  ok: boolean;
  error?: string;
  status?: number;
  /** Nom du template réellement appliqué (à afficher au retour). */
  templateName?: string | null;
  /** Le template a-t-il changé, ou n'est-ce qu'un rafraîchissement ? */
  templateChanged?: boolean;
  /** Le site était publié : son instantané public a été refait. */
  republished?: boolean;
  /** Sous-domaine republié, à revalider côté Next (le caller a le contexte). */
  publishedSubdomain?: string | null;
}

type SiteRow = {
  id: string;
  name: string | null;
  enterprise_id: number | null;
  is_template: boolean | null;
  is_published: boolean | null;
  published_subdomain: string | null;
  published_domain: string | null;
  source_template_id?: string | null;
};

const SITE_COLUMNS =
  "id, name, enterprise_id, is_template, is_published, published_subdomain, published_domain";

export async function rebuildSiteFromTemplate(
  supabase: SupabaseClient,
  siteId: string,
  templateId: string,
): Promise<RebuildSiteResult> {
  if (siteId === templateId) {
    return { ok: false, error: "Un site ne peut pas être refait à partir de lui-même", status: 400 };
  }

  // 1. Le site cible. On refuse de toucher à un template : le refaire depuis un
  //    autre modèle casserait toutes les démos qui en sont issues.
  let siteRes = await supabase
    .from("sites")
    .select(`${SITE_COLUMNS}, source_template_id`)
    .eq("id", siteId)
    .maybeSingle();
  if (isMissingColumn(siteRes.error)) {
    siteRes = await supabase.from("sites").select(SITE_COLUMNS).eq("id", siteId).maybeSingle();
  }
  if (siteRes.error) return { ok: false, error: siteRes.error.message, status: 500 };
  const site = siteRes.data as SiteRow | null;
  if (!site) return { ok: false, error: "Site introuvable", status: 404 };
  if (site.is_template === true) {
    return { ok: false, error: "Ce site est un template : il ne se refait pas depuis un autre", status: 400 };
  }

  // 2. Le template et ses sections.
  const [{ data: tpl, error: tErr }, { data: tplInstances, error: iErr }] = await Promise.all([
    supabase.from("sites").select(`${TEMPLATE_COLUMNS}, name, is_template`).eq("id", templateId).maybeSingle(),
    supabase.from("site_section_instances").select(INSTANCE_COLUMNS).eq("site_id", templateId),
  ]);
  if (tErr) return { ok: false, error: tErr.message, status: 500 };
  if (!tpl) return { ok: false, error: "Template introuvable", status: 404 };
  if (iErr) return { ok: false, error: iErr.message, status: 500 };

  const template = tpl as unknown as TemplateSlice & { name: string | null; is_template: boolean | null };
  const instances = (tplInstances ?? []) as TemplateInstance[];
  // Un template sans section produirait une page blanche : mieux vaut refuser
  // que de vider un site qui fonctionnait.
  if (instances.length === 0) {
    return { ok: false, error: "Ce template n'a aucune page : rien à appliquer", status: 422 };
  }

  const templateChanged = (site.source_template_id ?? null) !== templateId;

  // 3. Le contenu du site prend celui du template. `enterprise_id`,
  //    `lead_magnet_project_id`, le sous-domaine publié et l'étape du kanban ne
  //    bougent pas : c'est le même site, avec un autre habillage.
  const payload: Record<string, unknown> = {
    is_claude_design: template.is_claude_design ?? false,
    style_guide: template.style_guide ?? null,
    sitemap: template.sitemap ?? null,
    site_config: template.site_config ?? null,
    content_overrides: template.content_overrides ?? null,
    shared_assets: template.shared_assets ?? {},
    tweaks: template.tweaks ?? {},
    source_template_id: templateId,
    updated_at: new Date().toISOString(),
  };
  let upd = await supabase.from("sites").update(payload).eq("id", siteId);
  if (isMissingColumn(upd.error)) {
    const { source_template_id: _dropped, ...withoutSource } = payload;
    void _dropped;
    upd = await supabase.from("sites").update(withoutSource).eq("id", siteId);
  }
  if (upd.error) return { ok: false, error: upd.error.message, status: 500 };

  // 4. Les sections : on garde les anciennes sous la main pour pouvoir les
  //    remettre si l'insertion échoue — un site sans section n'affiche rien.
  const { data: previous } = await supabase
    .from("site_section_instances")
    .select(INSTANCE_COLUMNS)
    .eq("site_id", siteId);

  const { error: delErr } = await supabase.from("site_section_instances").delete().eq("site_id", siteId);
  if (delErr) return { ok: false, error: delErr.message, status: 500 };

  const cloned = instances.map((inst) => ({
    id: randomUUID(),
    site_id: siteId,
    section_id: inst.section_id ?? null,
    page_slug: inst.page_slug,
    sort_order: inst.sort_order,
    content: structuredClone(inst.content ?? {}),
    blocks: structuredClone(inst.blocks ?? []),
    custom_style: structuredClone(inst.custom_style ?? {}),
    is_hidden: inst.is_hidden ?? false,
  }));
  const { error: insErr } = await supabase.from("site_section_instances").insert(cloned);
  if (insErr) {
    const restore = ((previous ?? []) as TemplateInstance[]).map((inst) => ({
      id: randomUUID(),
      site_id: siteId,
      section_id: inst.section_id ?? null,
      page_slug: inst.page_slug,
      sort_order: inst.sort_order,
      content: inst.content ?? {},
      blocks: inst.blocks ?? [],
      custom_style: inst.custom_style ?? {},
      is_hidden: inst.is_hidden ?? false,
    }));
    if (restore.length > 0) await supabase.from("site_section_instances").insert(restore);
    return { ok: false, error: insErr.message, status: 500 };
  }

  // 5. Site déjà publié : le public sert l'instantané, pas le site vivant. On
  //    republie donc sur le même sous-domaine, ce qui embarque aussi les
  //    variables à jour (ville, stats, logo, avis).
  let republished = false;
  if (site.is_published === true && (site.published_subdomain || site.published_domain)) {
    const pub = await publishSite(supabase, siteId, {
      subdomain: site.published_subdomain ?? undefined,
      domain: site.published_domain ?? undefined,
    });
    if (!pub.ok) return { ok: false, error: pub.error ?? "Republication échouée", status: pub.status ?? 500 };
    republished = true;
  }

  return {
    ok: true,
    templateName: template.name ?? null,
    templateChanged,
    republished,
    publishedSubdomain: republished ? site.published_subdomain : null,
  };
}
