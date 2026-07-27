import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { marketingReenrichSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { applyEnrichReset, enrichResetPayload, TERMINAL_STATUSES } from "../_enrich-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Projets envoyés à l'edge function par appel. Elle les traite séquentiellement
 * (scraping + LLM, ~15-40 s chacun) et plafonne à 20 : au-delà de quelques
 * projets, c'est l'appel HTTP vers la fonction qui expirerait avant la fin.
 */
const CHUNK = 3;

/**
 * Budget de la requête, sous `maxDuration` : on préfère rendre un résultat
 * partiel + un curseur qu'une 504 qui ne dit ni ce qui a été fait ni où
 * reprendre. C'est exactement ce qui faisait échouer le rattrapage en masse.
 */
const BUDGET_MS = 200_000;

/** Statut d'un projet en cours de run : on ne le piétine pas. */
const PROCESSING = "processing";

type ProjectRow = {
  id: string;
  statut: string | null;
  variables: Record<string, unknown> | null;
};

type EdgeResult = {
  project_id?: string;
  status?: string;
  error?: string;
};

type Outcome = { project_id: string; status: string; error?: string };

/**
 * POST /api/marketing-pipeline/reenrich
 *
 * Écrase et rejoue l'enrichissement sur les projets déjà enrichis, sans avoir à
 * les cocher un par un : sélection par périmètre (déjà enrichis / en échec /
 * tous / liste d'ids), remise à zéro avec la même logique que le board
 * (`_enrich-reset`), puis appels à l'edge function par petits lots.
 *
 * Reprise : le balayage est un curseur keyset sur `id` (`after_id`), donc
 * chaque projet est traité une fois et une seule, quoi qu'il advienne de son
 * statut pendant l'opération — un tri par statut, lui, ferait revenir en boucle
 * les projets qui repassent à `framer` en fin de run. Quand le budget est
 * épuisé, la réponse porte `next_after_id` et le client rappelle.
 *
 * Réservé aux admins : c'est l'étape payante du pipeline, sur tout le parc.
 */
export const POST = withAuth({ role: "admin", body: marketingReenrichSchema }, async ({ body, cors }) => {
  const startedAt = Date.now();
  const supabase = getServiceClient();
  const { scope, overwrite, dry_run: dryRun } = body;

  if (scope === "ids" && (body.project_ids ?? []).length === 0) {
    return jsonError("project_ids requis avec scope=ids", 400, {}, cors);
  }

  /**
   * Applique le périmètre à une requête sur `lead_magnet_projects`. Typé large :
   * chaîner ces filtres sur le builder générique de supabase-js fait exploser
   * l'inférence (TS2589), et la valeur de retour est immédiatement awaitée.
   */
  const scoped = (query: any): any => {
    let q = query.not("entreprise_id", "is", null);
    if (scope === "ids") return q.in("id", body.project_ids ?? []);
    // Un run en cours n'est jamais réinitialisé sous les pieds de l'edge function.
    q = q.not("statut", "eq", PROCESSING);
    if (scope === "enriched") q = q.in("statut", [...TERMINAL_STATUSES]);
    if (scope === "failed") q = q.eq("statut", "failed");
    return q;
  };

  // Total du périmètre, seulement au premier appel : le client s'en sert pour la
  // barre de progression et le coût estimé.
  let total: number | null = null;
  if (!body.after_id) {
    const countRes = (await scoped(
      supabase.from("lead_magnet_projects").select("id", { count: "exact", head: true }),
    )) as { count: number | null; error: { message: string } | null };
    if (countRes.error) return jsonError(countRes.error.message, 500, {}, cors);
    total = countRes.count ?? 0;
  }

  const summary = { processed: 0, success: 0, failed: 0, no_website: 0, skipped: 0 };
  const outcomes: Outcome[] = [];
  let cursor = body.after_id ?? null;
  let done = false;
  const now = () => new Date().toISOString();

  // Un dry-run ne sert qu'à annoncer le périmètre (compte + coût estimé) : le
  // comptage ci-dessus suffit, inutile de paginer tout le parc pour rien.
  if (dryRun) {
    return json(
      { total, scope, overwrite, dry_run: true, summary, results: [], done: true, next_after_id: null, elapsed_ms: Date.now() - startedAt },
      { headers: cors },
    );
  }

  while (Date.now() - startedAt < BUDGET_MS) {
    let q = scoped(supabase.from("lead_magnet_projects").select("id, statut, variables"))
      .order("id", { ascending: true })
      .limit(CHUNK);
    if (cursor) q = q.gt("id", cursor);

    const { data, error } = (await q) as { data: ProjectRow[] | null; error: { message: string } | null };
    if (error) return jsonError(error.message, 500, { partial: summary }, cors);

    const rows = (data ?? []) as ProjectRow[];
    if (rows.length === 0) {
      done = true;
      break;
    }
    cursor = rows[rows.length - 1].id;

    // 1) Remise à zéro — sans elle l'edge function ignorerait un projet déjà
    //    enrichi (`already_framer`).
    const ready: string[] = [];
    for (const row of rows) {
      const resetError = await applyEnrichReset(
        supabase,
        row.id,
        enrichResetPayload({ statut: row.statut, variables: row.variables, overwrite, now: now() }),
      );
      if (resetError) {
        summary.processed += 1;
        summary.failed += 1;
        outcomes.push({ project_id: row.id, status: "reset_failed", error: resetError });
        continue;
      }
      ready.push(row.id);
    }
    if (ready.length === 0) continue;

    // 2) Enrichissement.
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project_ids: ready }),
      });

      if (!res.ok) {
        const details = (await res.text().catch(() => "")).slice(0, 300);
        summary.processed += ready.length;
        summary.failed += ready.length;
        for (const id of ready) {
          outcomes.push({ project_id: id, status: "edge_failed", error: `HTTP ${res.status} ${details}` });
        }
        continue;
      }

      const payload = (await res.json().catch(() => ({}))) as { results?: EdgeResult[] };
      const byId = new Map<string, EdgeResult>();
      for (const r of payload.results ?? []) if (r.project_id) byId.set(r.project_id, r);

      for (const id of ready) {
        const r = byId.get(id);
        const status = r?.status ?? "unknown";
        summary.processed += 1;
        if (status === "success") summary.success += 1;
        else if (status === "no_website") summary.no_website += 1;
        else if (status === "skipped") summary.skipped += 1;
        else summary.failed += 1;
        outcomes.push({ project_id: id, status, error: r?.error });
      }
    } catch (e) {
      // Fonction injoignable : on s'arrête là et on rend le curseur, plutôt que
      // de brûler le budget en réessayant tout le parc.
      const message = e instanceof Error ? e.message : "edge_function_unreachable";
      for (const id of ready) {
        summary.processed += 1;
        summary.failed += 1;
        outcomes.push({ project_id: id, status: "edge_unreachable", error: message });
      }
      break;
    }
  }

  return json(
    {
      total,
      scope,
      overwrite,
      dry_run: dryRun,
      summary,
      results: outcomes,
      done,
      next_after_id: done ? null : cursor,
      elapsed_ms: Date.now() - startedAt,
    },
    { headers: cors },
  );
});
