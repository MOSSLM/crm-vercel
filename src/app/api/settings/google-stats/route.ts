import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { googleStatsRefreshSchema } from "@/app/api/_lib/schemas";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Entreprises par appel à l'edge function. Un appel Places par fiche, en
 * séquentiel côté fonction : 50 passe confortablement, 200 (le plafond de
 * l'action) risquerait le timeout.
 */
const BATCH = 50;

/** Budget de la requête, sous `maxDuration`. Épuisé, on rend un curseur. */
const BUDGET_MS = 200_000;

/**
 * Une fiche à rattraper : elle a une page Google, mais la note ou le nombre
 * d'avis manque.
 *
 * Le « ou » compte. Le scraping initial relevait souvent la note sans le compte —
 * 132 fiches affichaient une note avec zéro avis, que le site rendait en
 * « 4,8 (0 avis) ». L'inverse existe aussi, et les deux se corrigent du même
 * appel.
 */
const CANDIDATE_FILTER = "google_place_id.not.is.null,google_url.not.is.null,google_maps_url.not.is.null";
const MISSING_FILTER = "nombre_avis.is.null,nombre_avis.eq.0,note_moyenne.is.null,note_moyenne.eq.0";

type Summary = { total: number; updated: number; unchanged: number; skipped: number; failed: number };

/**
 * GET /api/settings/google-stats
 *
 * Combien de fiches sont à rattraper. Sert à n'afficher le bouton que quand il a
 * quelque chose à faire, et à annoncer le volume avant de lancer.
 */
export const GET = withAuth({}, async ({ cors }) => {
  const sb = getServiceClient();
  const { count, error } = await sb
    .from("entreprises")
    .select("id", { count: "exact", head: true })
    .or(CANDIDATE_FILTER)
    .or(MISSING_FILTER);

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ candidates: count ?? 0 }, { headers: cors });
});

/**
 * POST /api/settings/google-stats
 *
 * Va rechercher la note et le nombre d'avis sur la fiche Google des entreprises
 * qui en manquent. Un appel Places par fiche — ni scraping, ni LLM, AUCUNE IA :
 * `rating` et `userRatingCount` sont deux champs d'API.
 *
 * Pourquoi une route dédiée plutôt qu'un réenrichissement : l'enrichissement
 * complet corrigerait ces fiches, mais il coûte un scraping et un appel LLM
 * chacune, et surtout il s'indexe sur les projets lead magnet — or aucune des
 * fiches concernées n'en a. Il ne les atteindrait pas.
 *
 * Balayage par curseur keyset sur `id` : chaque fiche est vue une fois, et la
 * réponse porte `next_after_id` tant qu'il reste du travail.
 *
 * Réservé aux admins, comme `ville-seo/recompute` : l'opération touche le parc.
 */
export const POST = withAuth(
  { role: "admin", body: googleStatsRefreshSchema },
  async ({ body, cors }) => {
    const startedAt = Date.now();
    const sb = getServiceClient();

    /** Page d'entreprises à rattraper, à partir du curseur. */
    const page = async (after: number | null): Promise<{ ids: number[]; error?: string }> => {
      let q = sb
        .from("entreprises")
        .select("id")
        .order("id", { ascending: true })
        .limit(BATCH);
      if (body.entreprise_ids && body.entreprise_ids.length > 0) {
        q = q.in("id", body.entreprise_ids);
      } else {
        // Sans liste explicite, on cible les fiches incomplètes ayant une page
        // Google. Les deux `or` se combinent en ET : (a une page) ET (manque
        // quelque chose).
        q = q.or(CANDIDATE_FILTER).or(MISSING_FILTER);
      }
      if (after !== null) q = q.gt("id", after);

      const { data, error } = await q;
      if (error) return { ids: [], error: error.message };
      return { ids: ((data ?? []) as Array<{ id: number }>).map((r) => r.id) };
    };

    const summary: Summary = { total: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    let cursor: number | null = body.after_id ?? null;
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
        body: JSON.stringify({ action: "refresh_google_stats", entreprise_ids: ids }),
      }).catch((e: unknown) => (e instanceof Error ? e : new Error("edge_function_unreachable")));

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
            // Le curseur permet de reprendre après le lot fautif.
            next_after_id: cursor,
          },
          cors,
        );
      }

      const payload = (await res.json().catch(() => ({}))) as {
        summary?: Partial<Summary>;
        remaining_entreprise_ids?: number[];
      };
      for (const key of Object.keys(summary) as Array<keyof Summary>) {
        summary[key] += payload.summary?.[key] ?? 0;
      }

      // L'edge function s'arrête à son propre budget de temps et rend les
      // entreprises qu'elle n'a pas traitées. Le curseur ci-dessus a DÉJÀ avancé
      // au-delà d'elles : continuer la boucle les enjamberait définitivement, sans
      // rien signaler. On s'arrête donc en reculant le curseur juste avant le lot
      // partiel, pour que la relance le reprenne en entier.
      const remaining = payload.remaining_entreprise_ids ?? [];
      if (remaining.length > 0) {
        cursor = Math.min(...remaining) - 1;
        break;
      }
    }

    return json(
      { summary, done, next_after_id: done ? null : cursor, elapsed_ms: Date.now() - startedAt },
      { headers: cors },
    );
  },
);
