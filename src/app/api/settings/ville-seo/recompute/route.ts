import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { villeSeoRecomputeSchema } from "@/app/api/_lib/schemas";
import { isMissingColumn } from "@/app/api/marketing-pipeline/_enrich-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Projets par appel à l'edge function. Le recalcul est gratuit mais pas
 * instantané (quelques requêtes par projet, en séquentiel côté fonction) :
 * envoyer 200 d'un coup faisait expirer l'appel, et l'écran ne renvoyait qu'un
 * « edge_function_request_failed » sans rien avoir recalculé.
 */
const BATCH = 40;

/**
 * Budget de la requête, sous `maxDuration`. Épuisé, on rend un résultat partiel
 * et un curseur : le client rappelle et la progression continue, au lieu de
 * tomber en 504 au bout de quelques milliers de projets.
 */
const BUDGET_MS = 200_000;

type Summary = { total: number; updated: number; unchanged: number; skipped: number; failed: number };

/**
 * POST /api/settings/ville-seo/recompute
 *
 * Rejoue la détermination de la ville SEO sur les projets déjà enrichis, sans
 * rescraper ni rappeler le LLM : l'edge function refait uniquement le calcul
 * géographique. Sans coût, donc relançable après chaque ajustement des seuils,
 * ajout d'une correction manuelle — ou changement de règle (« Région
 * parisienne » pour l'Île-de-France).
 *
 * Seuls les projets dont la ville SEO vient de l'enrichissement sont touchés :
 * `override_city_source = 'manual'` est écarté ici ET revérifié par l'edge
 * function. Les projets antérieurs à la migration ont `override_city_source`
 * à NULL et sont traités comme automatiques — c'est le but, ce sont eux qui
 * portent les villes issues de l'ancienne règle départementale.
 *
 * Balayage par curseur keyset sur `id` (`after_id`) : chaque projet est vu une
 * fois, et la réponse porte `next_after_id` tant qu'il reste du travail.
 *
 * Réservé aux admins : l'opération touche tout le parc, pas un projet.
 */
export const POST = withAuth({ role: "admin", body: villeSeoRecomputeSchema }, async ({ body, cors }) => {
  const startedAt = Date.now();
  const sb = getServiceClient();

  /**
   * Page de projets à recalculer, à partir du curseur. `override_city_source`
   * vient d'une migration appliquée à la main : si la colonne manque, on ne
   * filtre pas dessus (tous les projets sont alors « automatiques », ce qui est
   * exact — personne n'a pu marquer quoi que ce soit comme manuel) au lieu de
   * faire échouer tout le recalcul sur une colonne inconnue. C'était l'erreur
   * remontée par l'écran Paramètres.
   */
  const page = async (after: string | null): Promise<{ ids: string[]; error?: string }> => {
    const build = (withSource: boolean): any => {
      let q = sb.from("lead_magnet_projects").select("id").order("id", { ascending: true }).limit(BATCH);
      if (withSource) q = q.or("override_city_source.is.null,override_city_source.eq.auto");
      if (body.project_ids && body.project_ids.length > 0) q = q.in("id", body.project_ids);
      if (after) q = q.gt("id", after);
      return q;
    };

    let res = (await build(true)) as { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };
    if (res.error && isMissingColumn(res.error)) {
      console.warn("recompute ville SEO : override_city_source absente (migration non appliquée) — filtre ignoré");
      res = (await build(false)) as typeof res;
    }
    if (res.error) return { ids: [], error: res.error.message ?? "lecture des projets impossible" };
    return { ids: (res.data ?? []).map((r) => r.id) };
  };

  const summary: Summary = { total: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  let cursor = body.after_id ?? null;
  let done = false;

  while (Date.now() - startedAt < BUDGET_MS) {
    const { ids, error } = await page(cursor);
    if (error) return jsonError(error, 500, { partial: summary }, cors);
    if (ids.length === 0) {
      done = true;
      break;
    }
    cursor = ids[ids.length - 1];

    const res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "recompute_ville_seo", project_ids: ids }),
    }).catch((e: unknown) => e instanceof Error ? e : new Error("edge_function_unreachable"));

    if (res instanceof Error) {
      return jsonError(
        "edge_function_unreachable",
        502,
        { details: res.message, partial: summary, next_after_id: cursor },
        cors,
      );
    }
    if (!res.ok) {
      const details = await res.text().catch(() => "");
      return jsonError(
        "edge_function_request_failed",
        502,
        {
          upstream_status: res.status,
          details: details.slice(0, 500),
          partial: summary,
          // Le curseur permet de reprendre après le lot fautif au lieu de tout
          // recommencer depuis le début.
          next_after_id: cursor,
        },
        cors,
      );
    }

    const payload = (await res.json().catch(() => ({}))) as { summary?: Partial<Summary> };
    for (const key of Object.keys(summary) as Array<keyof Summary>) {
      summary[key] += payload.summary?.[key] ?? 0;
    }
  }

  return json(
    { summary, done, next_after_id: done ? null : cursor, elapsed_ms: Date.now() - startedAt },
    { headers: cors },
  );
});
