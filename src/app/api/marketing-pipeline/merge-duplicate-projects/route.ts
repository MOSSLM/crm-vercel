import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { compareProjects, pickBestProject } from "@/lib/site-builder/resolve-project-id";
import {
  buildFlagsPatch,
  buildMergePlan,
  type ProjectRecord,
} from "@/lib/site-builder/merge-lead-magnet-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/marketing-pipeline/merge-duplicate-projects
 * Body : { dryRun?: boolean }  — simulation par DÉFAUT.
 *
 * Une entreprise peut porter plusieurs `lead_magnet_projects` : le trigger en
 * crée un par opportunité, et attribuer un prospect à un agent ouvre un second
 * deal quand l'entreprise n'en avait que dans un autre pipeline. L'information
 * se répartit alors entre les deux lignes — les chiffres clés sur l'une, le logo
 * sur l'autre — pendant que le site n'en lit qu'une seule.
 *
 * Cette route ramène chaque entreprise à UN dossier :
 *   1. survivant = le projet le plus avancé (même classement que partout ailleurs) ;
 *   2. il récupère des doublons tout ce qui lui manque (jamais d'écrasement) ;
 *   3. avis, contenu et sites sont repointés sur lui ;
 *   4. les doublons vidés sont supprimés — uniquement hors `dryRun`.
 *
 * `dryRun` (défaut) n'écrit RIEN et renvoie le rapport complet : c'est la
 * lecture avant décision, pas une formalité.
 */
interface GroupReport {
  entrepriseId: number;
  survivorId: string;
  duplicateIds: string[];
  /** Colonnes récupérées sur un doublon → id de la ligne d'origine. */
  recovered: Record<string, string>;
  /** Drapeaux remontés (validation humaine portée par un doublon). */
  flags: string[];
  movedReviews: number;
  movedSites: number;
  movedContent: number;
  deleted: string[];
  error?: string;
}

/** Colonnes lues pour la fusion : tout ce qui est fusionnable + l'identité. */
const SELECT_COLUMNS = "*";

export const POST = withAuth({ role: "admin" }, async ({ req }) => {
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  // Simulation par défaut : il faut demander explicitement l'écriture.
  const dryRun = body.dryRun !== false;

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("lead_magnet_projects")
    .select(SELECT_COLUMNS)
    .not("entreprise_id", "is", null);
  if (error) return jsonError(error.message, 500);

  const byEnterprise = new Map<number, ProjectRecord[]>();
  for (const row of (data ?? []) as ProjectRecord[]) {
    const entrepriseId = Number(row.entreprise_id);
    if (!Number.isFinite(entrepriseId)) continue;
    const list = byEnterprise.get(entrepriseId);
    if (list) list.push(row);
    else byEnterprise.set(entrepriseId, [row]);
  }

  const groups = [...byEnterprise.entries()].filter(([, rows]) => rows.length > 1);
  const reports: GroupReport[] = [];

  for (const [entrepriseId, rows] of groups) {
    const survivor = pickBestProject(rows) as ProjectRecord | null;
    if (!survivor) continue;
    const survivorId = String(survivor.id);
    const duplicates = rows.filter((r) => String(r.id) !== survivorId);
    // Doublons classés du plus avancé au moins avancé (même comparateur que le
    // choix du survivant) : à valeur manquante, c'est le plus crédible qui la
    // fournit.
    const ordered = [...duplicates].sort((a, b) =>
      compareProjects(a as Parameters<typeof compareProjects>[0], b as Parameters<typeof compareProjects>[0]),
    );

    const plan = buildMergePlan(survivor, ordered);
    const flagsPatch = buildFlagsPatch(survivor, ordered);
    const report: GroupReport = {
      entrepriseId,
      survivorId,
      duplicateIds: duplicates.map((d) => String(d.id)),
      recovered: plan.takenFrom,
      flags: Object.keys(flagsPatch),
      movedReviews: 0,
      movedSites: 0,
      movedContent: 0,
      deleted: [],
    };

    try {
      const dupIds = report.duplicateIds;

      // Comptages : en simulation ils constituent le rapport, en réel ils
      // servent à vérifier ce qui a bougé.
      report.movedReviews = await countRows(supabase, "lead_magnet_reviews", "lead_magnet_project_id", dupIds);
      report.movedContent = await countRows(supabase, "lead_magnet_content", "lead_magnet_project_id", dupIds);
      report.movedSites = await countRows(supabase, "sites", "lead_magnet_project_id", dupIds);

      if (!dryRun) {
        const patch = { ...plan.patch, ...flagsPatch };
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase
            .from("lead_magnet_projects")
            .update(patch)
            .eq("id", survivorId);
          if (upErr) throw new Error(`fusion: ${upErr.message}`);
        }

        // Les sites suivent le survivant, sinon ils continueraient de lire une
        // ligne sur le point d'être supprimée.
        if (report.movedSites > 0) {
          const { error: sErr } = await supabase
            .from("sites")
            .update({ lead_magnet_project_id: survivorId })
            .in("lead_magnet_project_id", dupIds);
          if (sErr) throw new Error(`sites: ${sErr.message}`);
        }

        // Les avis se déplacent ; `lead_magnet_content` est UNIQUE par projet,
        // donc on ne déplace que si le survivant n'en a pas déjà.
        if (report.movedReviews > 0) {
          const { error: rErr } = await supabase
            .from("lead_magnet_reviews")
            .update({ lead_magnet_project_id: survivorId })
            .in("lead_magnet_project_id", dupIds);
          if (rErr) throw new Error(`avis: ${rErr.message}`);
        }
        if (report.movedContent > 0) {
          const survivorHasContent =
            (await countRows(supabase, "lead_magnet_content", "lead_magnet_project_id", [survivorId])) > 0;
          if (!survivorHasContent) {
            // Une seule ligne peut passer : on prend la première, les autres
            // partiront avec leur projet.
            const { data: first } = await supabase
              .from("lead_magnet_content")
              .select("id")
              .in("lead_magnet_project_id", dupIds)
              .limit(1)
              .maybeSingle();
            const firstId = (first as { id?: string } | null)?.id;
            if (firstId) {
              const { error: cErr } = await supabase
                .from("lead_magnet_content")
                .update({ lead_magnet_project_id: survivorId })
                .eq("id", firstId);
              if (cErr) throw new Error(`contenu: ${cErr.message}`);
            }
          } else {
            report.movedContent = 0; // le survivant avait déjà son contenu
          }
        }

        const { error: dErr } = await supabase.from("lead_magnet_projects").delete().in("id", dupIds);
        if (dErr) throw new Error(`suppression: ${dErr.message}`);
        report.deleted = dupIds;
      }
    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err);
    }

    reports.push(report);
  }

  return json({
    ok: true,
    dryRun,
    enterprisesScanned: byEnterprise.size,
    duplicateGroups: groups.length,
    duplicateRows: groups.reduce((n, [, rows]) => n + rows.length - 1, 0),
    recoveredFields: reports.reduce((n, r) => n + Object.keys(r.recovered).length, 0),
    errors: reports.filter((r) => r.error).length,
    reports,
  });
});

async function countRows(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
  column: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in(column, ids);
  return error ? 0 : (count ?? 0);
}
