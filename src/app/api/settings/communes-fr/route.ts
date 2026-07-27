import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { communesFrSeedSchema } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = (req: Request) => preflight(req);

const GEO_API = "https://geo.api.gouv.fr";

/** `true` quand la migration 20260727_ville_seo_geo n'a pas encore été appliquée. */
const isMissingTable = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? ""));

type GeoCommune = {
  code?: string;
  nom?: string;
  codesPostaux?: string[];
  population?: number;
  centre?: { type?: string; coordinates?: [number, number] };
};

/**
 * GET /api/settings/communes-fr
 *
 * État du référentiel utilisé par l'edge function pour calculer la ville SEO :
 * combien de communes sont chargées, et depuis quand.
 */
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();

  const { count, error } = await sb
    .from("communes_fr")
    .select("code_insee", { count: "exact", head: true });

  if (error) {
    if (isMissingTable(error)) {
      return json({ ready: false, migrated: false, count: 0, updated_at: null }, { headers: cors });
    }
    return jsonError(error.message, 500, {}, cors);
  }

  const { data: latest } = await sb
    .from("communes_fr")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json(
    {
      ready: (count ?? 0) > 0,
      migrated: true,
      count: count ?? 0,
      updated_at: (latest as { updated_at?: string } | null)?.updated_at ?? null,
    },
    { headers: cors },
  );
});

/**
 * POST /api/settings/communes-fr   { departement: "71" }
 *
 * Charge (ou rafraîchit) les communes d'UN département depuis geo.api.gouv.fr.
 *
 * Un département par appel, et non le pays entier : chaque requête reste courte
 * — pas de risque de timeout serverless sur les ~35 000 communes — et le client
 * peut afficher une progression. L'upsert sur `code_insee` rend l'opération
 * idempotente : relancer met simplement les populations à jour.
 */
export const POST = withAuth({ body: communesFrSeedSchema }, async ({ body, cors }) => {
  const { departement } = body;
  const sb = getServiceClient();

  const url =
    `${GEO_API}/departements/${encodeURIComponent(departement)}/communes` +
    `?fields=nom,code,codesPostaux,population,centre&format=json`;

  let payload: unknown;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return jsonError(`geo.api.gouv.fr a répondu ${res.status}`, 502, { departement }, cors);
    }
    payload = await res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(`geo.api.gouv.fr injoignable : ${msg}`, 502, { departement }, cors);
  }

  if (!Array.isArray(payload)) {
    return jsonError("Réponse inattendue de geo.api.gouv.fr", 502, { departement }, cors);
  }

  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (const raw of payload as GeoCommune[]) {
    // `centre` est un GeoJSON Point : coordinates = [longitude, latitude].
    const coords = raw?.centre?.coordinates;
    const lon = Array.isArray(coords) ? coords[0] : undefined;
    const lat = Array.isArray(coords) ? coords[1] : undefined;
    if (
      typeof raw?.code !== "string" ||
      typeof raw?.nom !== "string" ||
      typeof lat !== "number" ||
      typeof lon !== "number"
    ) {
      // Sans coordonnées, la commune ne sert à rien pour un calcul de distance.
      skipped++;
      continue;
    }
    rows.push({
      code_insee: raw.code,
      nom: raw.nom,
      codes_postaux: Array.isArray(raw.codesPostaux) ? raw.codesPostaux : [],
      population: typeof raw.population === "number" ? raw.population : 0,
      lat,
      lon,
      updated_at: now,
    });
  }

  // Lots de 500 : un département dépasse rarement 900 communes, mais le Pas-de-
  // Calais en compte ~890 et le Nord ~640 — deux allers-retours plutôt qu'un
  // payload unique de plusieurs centaines de kilo-octets.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from("communes_fr")
      .upsert(rows.slice(i, i + 500), { onConflict: "code_insee" });
    if (error) {
      if (isMissingTable(error)) {
        return jsonError(
          "La table communes_fr n'existe pas — applique d'abord sql/20260727_ville_seo_geo.sql.",
          409,
          { departement },
          cors,
        );
      }
      return jsonError(error.message, 500, { departement }, cors);
    }
  }

  return json({ departement, upserted: rows.length, skipped }, { headers: cors });
});
