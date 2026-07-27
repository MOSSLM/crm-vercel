import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/env";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { villeSeoRecomputeSchema } from "@/app/api/_lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

/** Lots envoyés à l'edge function — elle plafonne à 500 par appel. */
const BATCH = 200;

/**
 * POST /api/settings/ville-seo/recompute
 *
 * Rejoue la détermination de la ville SEO sur les projets déjà enrichis, sans
 * rescraper ni rappeler le LLM : l'edge function refait uniquement le calcul
 * géographique. Sans coût, donc relançable après chaque ajustement des seuils
 * ou ajout d'une correction manuelle.
 *
 * Seuls les projets dont la ville SEO vient de l'enrichissement sont touchés :
 * `override_city_source = 'manual'` est écarté ici ET revérifié par l'edge
 * function. Les projets antérieurs à la migration ont `override_city_source`
 * à NULL et sont traités comme automatiques — c'est le but, ce sont eux qui
 * portent les villes issues de l'ancienne règle départementale.
 *
 * Réservé aux admins : l'opération touche tout le parc, pas un projet.
 */
export const POST = withAuth({ role: "admin", body: villeSeoRecomputeSchema }, async ({ body, cors }) => {
  const sb = getServiceClient();

  let query = sb
    .from("lead_magnet_projects")
    .select("id")
    .or("override_city_source.is.null,override_city_source.eq.auto");

  if (body.project_ids && body.project_ids.length > 0) {
    query = query.in("id", body.project_ids);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500, {}, cors);

  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) {
    return json({ summary: { total: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 } }, { headers: cors });
  }

  const summary = { total: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < ids.length; i += BATCH) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-magnet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "recompute_ville_seo", project_ids: ids.slice(i, i + BATCH) }),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => "");
      return jsonError(
        "edge_function_request_failed",
        502,
        { upstream_status: res.status, details: details.slice(0, 500), partial: summary },
        cors,
      );
    }

    const payload = (await res.json()) as { summary?: Partial<typeof summary> };
    for (const key of Object.keys(summary) as Array<keyof typeof summary>) {
      summary[key] += payload.summary?.[key] ?? 0;
    }
  }

  return json({ summary }, { headers: cors });
});
