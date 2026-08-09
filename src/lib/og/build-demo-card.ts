import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StyleGuide } from "@/types";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
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
  "og_image_url", "og_shot_url", "og_logo_url",
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
  og_logo_url?: string | null;
};

type CompanyRow = {
  name: string | null;
  ville: string | null;
  logo_url: string | null;
  note_moyenne: number | string | null;
  nombre_avis: number | string | null;
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
    }),
    ensureOgLogo(supabase, siteId, company?.logo_url, {
      force: opts.force,
      existingUrl: data.og_logo_url,
    }),
  ]);
  if (shot.warning) warnings.push(shot.warning);
  if (logo.warning) warnings.push(logo.warning);

  const fonts = await loadOgFonts();
  const styleGuide = data.published_style_guide ?? data.style_guide ?? null;

  const card = await publishCard(supabase, {
    prefix: siteId,
    name: "card",
    keep: [shot.url, logo.url],
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
      rating: toNumber(company?.note_moyenne),
      reviewCount: toNumber(company?.nombre_avis),
      logoUrl: logo.url,
      shotUrl: shot.url,
      primaryColor: styleGuide?.colors?.primary ?? null,
      domain: hostOf(shareUrl),
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
    .select("name, ville, logo_url, note_moyenne, nombre_avis, service_tags")
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

function toNumber(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
