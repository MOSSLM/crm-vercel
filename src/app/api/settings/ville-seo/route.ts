import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { villeSeoSettingsSchema } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Seuils par défaut. Doivent rester alignés sur `DEFAULT_GEO_SETTINGS` dans
 * `edge function enrich/geo.ts` : c'est ce que l'edge function applique quand la
 * ligne de configuration est absente.
 */
export const DEFAULT_VILLE_SEO_SETTINGS = {
  metro_population: 100000,
  metro_radius_km: 30,
  big_city_population: 20000,
  preferred_radius_km: 35,
  max_radius_km: 60,
};

/** `true` quand la migration 20260727_ville_seo_geo n'a pas encore été appliquée. */
const isMissingTable = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? ""));

/**
 * GET /api/settings/ville-seo
 *
 * Seuils de l'arbitrage géographique + corrections manuelles. Tant que la
 * migration n'est pas appliquée, renvoie les valeurs par défaut avec
 * `migrated: false` pour que l'écran l'explique au lieu de planter.
 */
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();

  const { data: settings, error: settingsErr } = await sb
    .from("enrichment_geo_settings")
    .select("metro_population, metro_radius_km, big_city_population, preferred_radius_km, max_radius_km")
    .eq("id", "default")
    .maybeSingle();

  if (settingsErr && !isMissingTable(settingsErr)) {
    return jsonError(settingsErr.message, 500, {}, cors);
  }
  if (settingsErr) {
    return json(
      { migrated: false, settings: DEFAULT_VILLE_SEO_SETTINGS, overrides: [] },
      { headers: cors },
    );
  }

  const { data: overrides, error: overridesErr } = await sb
    .from("ville_seo_overrides")
    .select("id, code_postal, commune, ville_seo, note")
    .order("code_postal", { ascending: true });

  if (overridesErr && !isMissingTable(overridesErr)) {
    return jsonError(overridesErr.message, 500, {}, cors);
  }

  return json(
    {
      migrated: true,
      settings: settings ?? DEFAULT_VILLE_SEO_SETTINGS,
      overrides: overrides ?? [],
    },
    { headers: cors },
  );
});

/**
 * PUT /api/settings/ville-seo
 *
 * Met à jour les seuils. Les invariants (rayon max >= rayon confortable,
 * population métropole >= population grande ville) sont validés côté schéma ET
 * par des CHECK en base — l'edge function n'a donc jamais à s'en méfier.
 */
export const PUT = withAuth({ body: villeSeoSettingsSchema }, async ({ body, cors }) => {
  const sb = getServiceClient();

  const { error } = await sb
    .from("enrichment_geo_settings")
    .upsert({ id: "default", ...body, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    if (isMissingTable(error)) {
      return jsonError(
        "Applique d'abord sql/20260727_ville_seo_geo.sql dans Supabase.",
        409,
        {},
        cors,
      );
    }
    return jsonError(error.message, 500, {}, cors);
  }

  return json({ settings: body }, { headers: cors });
});
