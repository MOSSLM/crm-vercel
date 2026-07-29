import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { marketingEnrichPrepareSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { resolveAgentContext } from "@/app/api/_lib/require-capability";
import { pickBestProject } from "@/lib/site-builder/resolve-project-id";
import { applyEnrichReset, enrichResetPayload, OVERWRITE_CLEARED_COLUMNS } from "../_enrich-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

type OppRow = { id: string; entreprise_id: number | null };
type ProjectRow = {
  id: string;
  opportunite_id: string | null;
  statut: string | null;
  variables: Record<string, unknown> | null;
};

type Prepared = { opportunity_id: string; project_id: string; created: boolean; reset: boolean };
type PrepError = { opportunity_id: string; error: string };

/**
 * POST /api/marketing-pipeline/enrich-prepare   { opportunity_ids, overwrite? }
 *
 * Makes a batch of opportunities ready for (re)enrichment so the client can
 * then fire `/api/lead-magnet/enrich` per returned project id:
 *   - ensures every opportunity has a `lead_magnet_projects` row (creates one
 *     when missing — this is what removes the "aucune opportunité … n'a de
 *     projet lead magnet" dead-end);
 *   - resets already-enriched projects (`framer`/`ready`/`published`) back to
 *     `draft` so the edge function actually re-runs instead of skipping them;
 *   - on `overwrite`, also clears the enrichment-derived columns for a fresh run.
 *
 * Uses the service client (RLS-bypassing) after `withAuth` has validated the
 * caller, mirroring the other marketing-pipeline routes.
 */
export const POST = withAuth({ body: marketingEnrichPrepareSchema }, async ({ body, user, cors }) => {
  const { opportunity_ids, overwrite } = body;
  const supabase = getServiceClient();

  let ids = [...new Set(opportunity_ids)];

  // Un agent freelance ne prépare que ses propres entreprises. L'admin, lui,
  // travaille sur tout le board — comportement inchangé.
  const ctx = await resolveAgentContext(user.id);
  if (ctx.role === "freelance") {
    if (!ctx.canUseMarketingPipeline) {
      return jsonError("capability_refusee", 403, { capability: "marketing_pipeline" }, cors);
    }
    const { data: scoped } = await supabase
      .from("opportunites")
      .select("id, entreprises!inner(id, owner_id)")
      .in("id", ids)
      .eq("entreprises.owner_id", user.id);
    ids = (scoped ?? []).map((o) => o.id as string);
    if (ids.length === 0) return jsonError("entreprise_non_attribuee", 403, {}, cors);
  }

  const { data: oppsData } = await supabase.from("opportunites").select("id, entreprise_id").in("id", ids);
  const oppById = new Map<string, OppRow>();
  for (const o of (oppsData ?? []) as OppRow[]) oppById.set(o.id, o);

  // Le dossier lead magnet est par ENTREPRISE : on le cherche donc par
  // entreprise, pas par opportunité. Chercher par `opportunite_id` faisait
  // manquer le dossier dès que l'entreprise avait un second deal — et créait
  // alors un doublon vide, celui-là même qui a coupé les chiffres clés en deux.
  const entIds = [...new Set((oppsData ?? []).map((o) => o.entreprise_id).filter((v): v is number => v != null))];
  const projectsRes = entIds.length > 0
    ? await supabase
        .from("lead_magnet_projects")
        .select("id, opportunite_id, entreprise_id, statut, variables, enrichment_validated, pret_pour_lm, updated_at, created_at")
        .in("entreprise_id", entIds)
    : { data: [] as ProjectRow[] };

  const projectsByEnt = new Map<number, ProjectRow[]>();
  for (const p of (projectsRes.data ?? []) as ProjectRow[]) {
    const entId = (p as { entreprise_id?: number | null }).entreprise_id;
    if (entId == null) continue;
    const list = projectsByEnt.get(entId);
    if (list) list.push(p);
    else projectsByEnt.set(entId, [p]);
  }
  const projectByEnt = new Map<number, ProjectRow>();
  for (const [entId, rows] of projectsByEnt) {
    const best = pickBestProject(rows as Array<{ id: string }>);
    if (best) projectByEnt.set(entId, best as ProjectRow);
  }

  const prepared: Prepared[] = [];
  const errors: PrepError[] = [];
  const now = new Date().toISOString();

  for (const oppId of ids) {
    const opp = oppById.get(oppId);
    if (!opp) {
      errors.push({ opportunity_id: oppId, error: "opportunité introuvable" });
      continue;
    }
    if (opp.entreprise_id == null) {
      errors.push({ opportunity_id: oppId, error: "aucune entreprise liée" });
      continue;
    }

    const existing = projectByEnt.get(opp.entreprise_id);

    if (!existing) {
      // Upsert on the unique `opportunite_id`: if the trigger already created a
      // row we didn't see (e.g. the select above failed), this updates it instead
      // of blowing up on a duplicate-key violation.
      const { data, error } = await supabase
        .from("lead_magnet_projects")
        .upsert(
          {
            opportunite_id: oppId,
            entreprise_id: opp.entreprise_id,
            pret_pour_lm: true,
            statut: "draft",
            ...(overwrite ? OVERWRITE_CLEARED_COLUMNS : {}),
          },
          { onConflict: "opportunite_id" },
        )
        .select("id")
        .single();
      if (error || !data) {
        errors.push({ opportunity_id: oppId, error: error?.message ?? "création du projet échouée" });
        continue;
      }
      prepared.push({ opportunity_id: oppId, project_id: data.id as string, created: true, reset: true });
      continue;
    }

    const payload = enrichResetPayload({
      statut: existing.statut,
      variables: existing.variables,
      overwrite,
      now,
    });

    const error = await applyEnrichReset(supabase, existing.id, payload);
    if (error) {
      errors.push({ opportunity_id: oppId, error });
      continue;
    }
    prepared.push({
      opportunity_id: oppId,
      project_id: existing.id,
      created: false,
      reset: payload.statut === "draft",
    });
  }

  return json({ prepared, errors }, { headers: cors });
});
