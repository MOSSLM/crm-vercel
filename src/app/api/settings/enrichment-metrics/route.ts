import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const OPTIONS = (req: Request) => preflight(req);

/** Périodes proposées par le panneau. `0` = tout l'historique. */
const ALLOWED_DAYS = [7, 30, 90, 0];
const DEFAULT_DAYS = 30;
/** Assez pour lire ce qui vient de tourner, assez peu pour ne rien alourdir. */
const RECENT_LIMIT = 50;

/**
 * `true` quand l'objet n'existe pas encore (migration `20260806_enrichment_runs`
 * non appliquée). Les migrations partent à la main dans l'éditeur SQL Supabase,
 * donc le code tourne forcément un temps sans elles : la page Paramètres doit
 * rester affichable, avec un panneau qui dit ce qu'il manque.
 */
const isMissingObject = (error: { code?: string; message?: string } | null): boolean =>
  !!error &&
  (error.code === "42P01" || // relation absente
    error.code === "42883" || // fonction absente
    error.code === "PGRST202" || // fonction inconnue du cache PostgREST
    error.code === "PGRST205" || // table inconnue du cache PostgREST
    /does not exist|could not find/i.test(error.message ?? ""));

/**
 * GET /api/settings/enrichment-metrics?days=30
 *
 * Qualité et coût de l'edge function d'enrichissement, lus dans le journal des
 * runs (`enrichment_runs`, alimenté par l'edge function elle-même).
 *
 * Réservé aux admins — les autres routes de réglages se contentent d'un
 * utilisateur authentifié, mais celle-ci expose des coûts, que les agents
 * freelance n'ont pas à voir. La lecture passe par le service client : la RLS de
 * `enrichment_runs` réserve déjà le SELECT aux admins, le contrôle est fait ici.
 */
export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const raw = Number(new URL(req.url).searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(raw) ? raw : DEFAULT_DAYS;
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  const sb = getServiceClient();

  const [byModel, fillRate, failures, recent, pricing] = await Promise.all([
    sb.rpc("enrichment_metrics_by_model", { p_since: since }),
    sb.rpc("enrichment_field_fill_rate", { p_since: since }),
    sb.rpc("enrichment_failure_reasons", { p_since: since }),
    (() => {
      const q = sb
        .from("enrichment_runs")
        .select(
          "id, created_at, project_id, entreprise_id, source, status, outcome_reason, duration_ms, " +
            "site_url_input, site_reached, scrape_pages, scrape_via, llm_provider, llm_model, " +
            "llm_attempts, llm_tokens_prompt, llm_tokens_completion, fields_found_count, fields_total, " +
            "fields_written, error_message",
        )
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      return since ? q.gte("created_at", since) : q;
    })(),
    sb.from("enrichment_llm_pricing").select("model, provider, input_cents_per_mtok, output_cents_per_mtok"),
  ]);

  // Un seul objet manquant suffit à conclure : ils viennent tous de la même
  // migration. Réponse 200 assumée — ce n'est pas une erreur, c'est un état
  // d'installation, et le panneau sait l'afficher.
  const missing = [byModel, fillRate, failures, recent, pricing].find((r) => isMissingObject(r.error));
  if (missing) {
    return json(
      { installed: false, hint: "sql/20260806_enrichment_runs.sql non appliquée" },
      { headers: cors },
    );
  }

  const failed = [byModel, fillRate, failures, recent, pricing].find((r) => r.error);
  if (failed) return jsonError(failed.error?.message ?? "query_failed", 500, {}, cors);

  return json(
    {
      installed: true,
      days,
      by_model: byModel.data ?? [],
      field_fill_rate: fillRate.data ?? [],
      failures: failures.data ?? [],
      recent: recent.data ?? [],
      pricing: pricing.data ?? [],
    },
    { headers: cors },
  );
});
