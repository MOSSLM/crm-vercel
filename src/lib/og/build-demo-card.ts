import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StyleGuide } from "@/types";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import { deriveSubdomainLabel } from "@/lib/site-builder/derive-subdomain";
import { SITE_DOMAIN } from "@/lib/site-domain";
import { ensureDemoScreenshot } from "@/lib/site-builder/ensure-demo-screenshot";
import { ensureOgLogo } from "@/lib/site-builder/ensure-og-logo";
import { selectDroppingMissingColumns } from "@/lib/schema-drift";
import { loadOgFonts, fontStack } from "@/lib/og/fonts";
import { publishCard } from "@/lib/og/render-card";
import { DemoCard } from "@/lib/og/demo-card";

/**
 * Fabriquer la carte de partage d'un démo, de bout en bout.
 *
 * Un seul point d'entrée pour trois appelants qui ont des contraintes très
 * différentes :
 *   - le dialogue « Partager », qui veut l'image AVANT que l'opérateur ouvre
 *     WhatsApp (c'est le chemin normal, et le seul qui soit à l'heure) ;
 *   - la route `/api/og/demo/{siteId}`, appelée pendant l'unfurl si la carte
 *     manque encore — lente, mais elle évite la vignette blanche ;
 *   - le cron, filet pour les envois automatiques qui ne passent par aucun
 *     dialogue.
 *
 * Les trois ont besoin exactement du même travail. Le dupliquer aurait garanti
 * que l'un des trois dérive.
 */

const SITE_COLUMNS = [
  "id", "name", "enterprise_id", "published_subdomain",
  "style_guide", "published_style_guide",
  "og_image_url", "og_shot_url", "og_shot_mobile_url", "og_logo_url", "og_logo_sombre",
] as const;

type SiteRow = {
  id: string;
  name?: string | null;
  enterprise_id?: number | null;
  published_subdomain?: string | null;
  style_guide?: StyleGuide | null;
  published_style_guide?: StyleGuide | null;
  og_image_url?: string | null;
  og_shot_url?: string | null;
  og_shot_mobile_url?: string | null;
  og_logo_url?: string | null;
  og_logo_sombre?: boolean | null;
};

type CompanyRow = {
  name: string | null;
  ville: string | null;
  logo_url: string | null;
  service_tags: string[] | string | null;
};

export type BuildDemoCardResult =
  | { ok: true; url: string; regenerated: boolean; warnings: string[] }
  | { ok: false; error: string; status: number };

export async function buildDemoCard(
  supabase: SupabaseClient,
  siteId: string,
  opts: { force?: boolean } = {},
): Promise<BuildDemoCardResult> {
  const { data, error } = await selectDroppingMissingColumns<SiteRow>(SITE_COLUMNS, (select) =>
    supabase.from("sites").select(select).eq("id", siteId).single(),
  );
  if (error || !data) return { ok: false, error: "Site introuvable.", status: 404 };

  // Déjà fabriquée : on ne refait rien. C'est ce qui permet au dialogue
  // « Partager » d'appeler `prepare` à chaque ouverture sans coût ni latence.
  if (!opts.force && data.og_image_url) {
    return { ok: true, url: data.og_image_url, regenerated: false, warnings: [] };
  }

  const warnings: string[] = [];
  const company = await loadCompany(supabase, data.enterprise_id ?? null);
  const shareUrl = demoShareUrl({ id: data.id, published_subdomain: data.published_subdomain });

  // Capture et logo en parallèle : deux allers-retours réseau indépendants, et
  // c'est la latence de cette étape que l'opérateur attend devant son écran.
  const [shot, logo] = await Promise.all([
    ensureDemoScreenshot(supabase, siteId, shareUrl, {
      force: opts.force,
      existingUrl: data.og_shot_url,
      existingMobileUrl: data.og_shot_mobile_url,
    }),
    ensureOgLogo(supabase, siteId, company?.logo_url, {
      force: opts.force,
      existingUrl: data.og_logo_url,
      existingSombre: data.og_logo_sombre,
    }),
  ]);
  if (shot.warning) warnings.push(shot.warning);
  if (logo.warning) warnings.push(logo.warning);

  const fonts = await loadOgFonts();
  const styleGuide = data.published_style_guide ?? data.style_guide ?? null;

  const card = await publishCard(supabase, {
    prefix: siteId,
    name: "card",
    keep: [shot.url, shot.mobileUrl, logo.url],
    persist: {
      table: "sites",
      column: "og_image_url",
      match: { id: siteId },
      stampColumn: "og_generated_at",
    },
    element: DemoCard({
      companyName: company?.name?.trim() || data.name?.trim() || "Votre entreprise",
      city: company?.ville ?? null,
      serviceTags: normalizeTags(company?.service_tags),
      logoUrl: logo.url,
      logoSombre: logo.sombre ?? data.og_logo_sombre ?? null,
      shotUrl: shot.url,
      shotMobileUrl: shot.mobileUrl ?? null,
      primaryColor: styleGuide?.colors?.primary ?? null,
      domain: adresseVitrine(data, company),
      displayFont: fontStack(fonts, "display"),
      bodyFont: fontStack(fonts, "body"),
    }),
  });

  if (!card.ok) return { ok: false, error: card.error, status: 502 };
  return { ok: true, url: card.url, regenerated: true, warnings };
}

async function loadCompany(
  supabase: SupabaseClient,
  enterpriseId: number | null,
): Promise<CompanyRow | null> {
  if (enterpriseId == null) return null;
  const { data } = await supabase
    .from("entreprises")
    .select("name, ville, logo_url, service_tags")
    .eq("id", enterpriseId)
    .maybeSingle();
  return (data as CompanyRow | null) ?? null;
}

/** `service_tags` est tantôt un tableau, tantôt une chaîne — les deux existent en base. */
function normalizeTags(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

/**
 * Ce qu'affiche la barre d'adresse du mockup navigateur.
 *
 * LE DÉFAUT QU'ON CORRIGE : tant qu'un site n'est pas déployé, son lien de
 * partage est `{uuid}.samadigitalstudio.fr`. Recopier cet hôte tel quel mettait
 * « 84c540de-8509-48de-9470-f01ebdbd30d2.samadigitalstudio.fr » dans la barre
 * d'adresse de la vignette — sur CHACUNE des cartes de ce parc, puisque aucun
 * démo n'est déployé. Un prospect y lit un truc technique et inachevé, à
 * l'endroit précis où on veut qu'il voie son propre site.
 *
 * On affiche donc l'adresse que le site AURA une fois déployé, dérivée par la
 * même fonction que le déploiement (`deriveSubdomainLabel`) — donc exactement
 * celle qu'il portera. Ce n'est pas un décor inventé : c'est une promesse que
 * le déploiement tiendra à l'identique.
 *
 * Un site déjà déployé garde évidemment son vrai hôte.
 */
function adresseVitrine(site: SiteRow, company: CompanyRow | null): string {
  if (site.published_subdomain) return `${site.published_subdomain}.${SITE_DOMAIN}`;
  const label = deriveSubdomainLabel(null, company?.name ?? site.name ?? "");
  return label ? `${label}.${SITE_DOMAIN}` : SITE_DOMAIN;
}
