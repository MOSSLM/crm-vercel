import { preflight } from "@/app/api/_lib/cors";
import { json } from "@/app/api/_lib/respond";
import { marketingEnrichPrepareSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/** Statuses the enrichment edge function refuses to re-process (see
 *  `shouldProcess` in the edge function): a manual re-run must reset these
 *  back to `draft` first, otherwise the run is silently skipped. */
const TERMINAL_STATUSES = new Set(["framer", "ready", "published"]);

/** Columns the edge function fills during enrichment. Cleared on `overwrite`
 *  so the next run repopulates them from a clean slate. Manual reviews and the
 *  `entreprises` row are intentionally left untouched. */
const OVERWRITE_CLEARED_COLUMNS = {
  override_entreprise_name: null,
  override_email: null,
  override_address: null,
  override_location: null,
  logo_url: null,
  stat_years_experience: null,
  stat_satisfied_clients: null,
  stat_installations_completed: null,
  stat_rge_count: null,
  service_tags_snapshot: [] as string[],
};

type OppRow = { id: string; entreprise_id: number | null };
type ProjectRow = {
  id: string;
  opportunite_id: string | null;
  statut: string | null;
  variables: Record<string, unknown> | null;
  created_at: string | null;
};

type Prepared = { opportunity_id: string; project_id: string; created: boolean; reset: boolean };
type PrepError = { opportunity_id: string; error: string };

/** Drops the enrichment-derived "villes autour" keys from a project's jsonb. */
function stripSurroundingCities(variables: Record<string, unknown> | null): Record<string, unknown> {
  const vars = { ...(variables ?? {}) };
  delete vars.surrounding_cities;
  delete vars.surrounding_cities_text;
  return vars;
}

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
export const POST = withAuth({ body: marketingEnrichPrepareSchema }, async ({ body, cors }) => {
  const { opportunity_ids, overwrite } = body;
  const supabase = getServiceClient();

  const ids = [...new Set(opportunity_ids)];

  const [oppsRes, projectsRes] = await Promise.all([
    supabase.from("opportunites").select("id, entreprise_id").in("id", ids),
    supabase
      .from("lead_magnet_projects")
      .select("id, opportunite_id, statut, variables, created_at")
      .in("opportunite_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const oppById = new Map<string, OppRow>();
  for (const o of (oppsRes.data ?? []) as OppRow[]) oppById.set(o.id, o);

  // Keep the most recent project per opportunity (rows are ordered desc above).
  const projectByOpp = new Map<string, ProjectRow>();
  for (const p of (projectsRes.data ?? []) as ProjectRow[]) {
    if (p.opportunite_id && !projectByOpp.has(p.opportunite_id)) projectByOpp.set(p.opportunite_id, p);
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

    const existing = projectByOpp.get(oppId);

    if (!existing) {
      const { data, error } = await supabase
        .from("lead_magnet_projects")
        .insert({
          opportunite_id: oppId,
          entreprise_id: opp.entreprise_id,
          pret_pour_lm: true,
          statut: "draft",
          ...(overwrite ? OVERWRITE_CLEARED_COLUMNS : {}),
        })
        .select("id")
        .single();
      if (error || !data) {
        errors.push({ opportunity_id: oppId, error: error?.message ?? "création du projet échouée" });
        continue;
      }
      prepared.push({ opportunity_id: oppId, project_id: data.id as string, created: true, reset: true });
      continue;
    }

    const needsReset = overwrite || TERMINAL_STATUSES.has(existing.statut ?? "");
    const payload: Record<string, unknown> = { pret_pour_lm: true, updated_at: now };
    if (needsReset) payload.statut = "draft"; // `enrichment_error` is cleared by the edge function's lock.
    if (overwrite) {
      Object.assign(payload, OVERWRITE_CLEARED_COLUMNS);
      payload.variables = stripSurroundingCities(existing.variables);
    }

    const { error } = await supabase.from("lead_magnet_projects").update(payload).eq("id", existing.id);
    if (error) {
      errors.push({ opportunity_id: oppId, error: error.message });
      continue;
    }
    prepared.push({ opportunity_id: oppId, project_id: existing.id, created: false, reset: needsReset });
  }

  return json({ prepared, errors }, { headers: cors });
});
