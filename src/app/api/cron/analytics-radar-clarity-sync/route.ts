import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { fetchClarityInsights, getClarityToken, normalizeClarityResponse, type ClarityDimension } from "@/lib/analytics-radar/clarity-client";

export const runtime = "nodejs";

/**
 * Rapatrie les métriques Clarity dans `analytics_radar_clarity_cache`.
 *
 * Appelé par pg_cron toutes les 4h (sql/20260818_analytics_radar_clarity_cache.sql)
 * — jamais depuis une requête utilisateur : l'API Clarity plafonne à 10
 * requêtes/jour/projet, et ce cron doit rester loin en dessous (6 appels/jour
 * avec 6 dimensions ci-dessous suffit à saturer les 3 derniers jours dispos).
 * Même contrat d'auth que les autres crons (CRON_SECRET / PG_CRON_SECRET).
 */
const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const pgCronSecret = process.env.PG_CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret && !pgCronSecret) return false;
  if (!cronSecret && !pgCronSecret) return true;
  const auth = req.headers.get("authorization");
  const pgHeader = req.headers.get("x-pg-cron-secret");
  return (!!cronSecret && auth === `Bearer ${cronSecret}`) || (!!pgCronSecret && pgHeader === pgCronSecret);
};

// Une dimension par appel : on reste large sous le plafond de 10/jour tout en
// couvrant les axes dont l'écran a besoin (villes/pays pour le globe, device
// et source pour l'onglet Comportement).
const DIMENSION_SETS: ClarityDimension[][] = [["Country"], ["Device"], ["Source"]];

export async function GET(req: Request) {
  if (!verifyCron(req)) return jsonError("Unauthorized", 401);

  const token = getClarityToken();
  if (!token) return json({ skipped: true, reason: "CLARITY_API_TOKEN non configuré" });

  const sb = getServiceClient();
  const results: Array<{ dimensions: string[]; ok: boolean; error?: string }> = [];

  for (const dims of DIMENSION_SETS) {
    try {
      const raw = await fetchClarityInsights(token, 3, dims);
      const insights = normalizeClarityResponse(raw);
      for (const insight of insights) {
        const { error } = await sb.from("analytics_radar_clarity_cache").upsert(
          {
            metric_name: insight.metricName,
            dimension1: dims[0] ?? null,
            dimension2: dims[1] ?? null,
            dimension3: dims[2] ?? null,
            payload: insight.information,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "metric_name,dimension1,dimension2,dimension3" },
        );
        if (error) throw new Error(error.message);
      }
      results.push({ dimensions: dims, ok: true });
    } catch (e) {
      results.push({ dimensions: dims, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ synced_at: new Date().toISOString(), results });
}
