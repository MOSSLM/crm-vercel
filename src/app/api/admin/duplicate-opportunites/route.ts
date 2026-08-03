import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { duplicateGroups, pickSurvivor, type DealRecord } from "@/lib/opportunites/one-per-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/** PostgREST plafonne une réponse à 1 000 lignes : on pagine. */
const PAGE = 1000;
const MAX_ROWS = 100_000;

/**
 * Admin : les entreprises qui portent encore plus d'une affaire.
 *
 * État des lieux AVANT et APRÈS la fusion
 * (`sql/20260803_merge_duplicate_opportunites.sql`), et contrôle de non-régression
 * une fois l'index unique `opportunites_entreprise_unique` posé : cette liste
 * doit rester vide. Elle recoupe l'erreur que renvoie l'index quand il refuse de
 * se créer (`Key (entreprise_id)=(…) is duplicated`).
 *
 * Lecture seule — la fusion, elle, se fait en SQL : elle doit repointer les
 * lignes filles de toutes les tables qui référencent `opportunites(id)`, ce que
 * seul un parcours du catalogue Postgres garantit exhaustif.
 */
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sc = getServiceClient();

  const rows: DealRecord[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sc
      .from("opportunites")
      .select("id, entreprise_id, owner_id, pipeline_id, stage_id, created_at, is_test")
      .not("entreprise_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return jsonError(error.message, 500, {}, cors);
    const page = (data ?? []) as DealRecord[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const groups = duplicateGroups(rows);

  // Noms d'entreprises et de pipelines, pour que le rapport soit lisible sans
  // aller croiser les ids à la main.
  const entIds = [...groups.keys()];
  const pipelineIds = [
    ...new Set(
      [...groups.values()].flatMap((deals) =>
        deals.map((d) => d.pipeline_id).filter((p): p is string => !!p),
      ),
    ),
  ];

  const [entsRes, pipesRes] = await Promise.all([
    entIds.length > 0
      ? sc.from("entreprises").select("id, name, owner_id").in("id", entIds)
      : Promise.resolve({ data: [] as { id: number; name: string | null; owner_id: string | null }[] }),
    pipelineIds.length > 0
      ? sc.from("pipelines").select("id, nom").in("id", pipelineIds)
      : Promise.resolve({ data: [] as { id: string; nom: string | null }[] }),
  ]);

  const entById = new Map((entsRes.data ?? []).map((e) => [e.id as number, e]));
  const pipeById = new Map((pipesRes.data ?? []).map((p) => [p.id as string, p.nom as string | null]));

  const entreprises = [...groups.entries()].map(([entrepriseId, deals]) => {
    const survivor = pickSurvivor(deals);
    return {
      entreprise_id: entrepriseId,
      entreprise_nom: entById.get(entrepriseId)?.name ?? null,
      owner_id: entById.get(entrepriseId)?.owner_id ?? null,
      // Celle que la fusion garderait : la plus ancienne, qui porte l'historique.
      survivant_id: survivor ? String(survivor.id) : null,
      affaires: deals.map((d) => ({
        id: String(d.id),
        pipeline_nom: d.pipeline_id ? (pipeById.get(d.pipeline_id) ?? null) : null,
        owner_id: d.owner_id ?? null,
        created_at: d.created_at ?? null,
      })),
    };
  });

  return json(
    {
      ok: true,
      affairesScannees: rows.length,
      entreprisesEnDoublon: groups.size,
      affairesEnTrop: [...groups.values()].reduce((n, deals) => n + deals.length - 1, 0),
      entreprises,
    },
    { headers: cors },
  );
});
