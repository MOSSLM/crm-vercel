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

// Une dimension par appel, et le plafond Clarity est de 10 appels/jour/projet
// — DUR, pas indicatif. 3 dimensions × 6 passages/jour = 18 appels : le
// planificateur doit donc tourner 3×/jour au maximum (cf. la migration SQL,
// qui a été corrigée en même temps que ce commentaire). Ajouter une dimension
// ici sans réduire la fréquence remettrait le quota en défaut.
const DIMENSION_SETS: ClarityDimension[][] = [["Country"], ["Device"], ["Source"]];
const MAX_CALLS_PER_DAY = 10;

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

  return json({ synced_at: new Date().toISOString(), results, callsUsed: DIMENSION_SETS.length, maxCallsPerDay: MAX_CALLS_PER_DAY });
}

/**
 * pg_cron déclenche cette route avec `net.http_post` (cf. la migration
 * sql/20260818_analytics_radar_clarity_cache.sql). Sans handler POST, Next
 * répondait 405 et la synchronisation ne tournait jamais : le cache restait
 * vide et l'écran affichait « Clarity non configuré » indéfiniment, alors que
 * le jeton était bon.
 */
export const POST = GET;
