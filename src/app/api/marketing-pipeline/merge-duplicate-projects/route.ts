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

type ServiceClient = ReturnType<typeof getServiceClient>;

/**
 * Doublons de `lead_magnet_projects` : diagnostic (GET) et fusion (POST).
 *
 * Une entreprise peut porter plusieurs dossiers : le trigger en crée un par
 * opportunité, et attribuer un prospect à un agent ouvre un second deal quand
 * l'entreprise n'en avait que dans un autre pipeline. L'information se répartit
 * alors entre les deux lignes — les chiffres clés sur l'une, le logo sur
 * l'autre — pendant que le site n'en lit qu'une seule.
 *
 * GET  → la liste des entreprises encore en doublon. À passer AVANT la migration
 *        `20260731_one_lead_magnet_project_per_company.sql` : son index unique
 *        échoue tant qu'il en reste un.
 * POST → la fusion. `dryRun` par défaut ; `{ "dryRun": false }` pour écrire.
 *        `entrepriseIds` restreint à quelques entreprises (mise au point).
 *
 * Le balayage est PAGINÉ : PostgREST plafonne une réponse à 1 000 lignes, et une
 * fusion qui ne voit qu'une partie de la table laisse des doublons derrière elle
 * — exactement ce qui fait échouer l'index unique ensuite.
 */
const PAGE = 1000;

interface IdRow {
  id: string;
  entreprise_id: number | null;
}

/** Toutes les paires (id, entreprise_id), par pages de 1 000. */
async function scanAllProjects(
  supabase: ServiceClient,
  entrepriseIds?: number[],
): Promise<{ rows: IdRow[]; error?: string }> {
  const rows: IdRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("lead_magnet_projects")
      .select("id, entreprise_id")
      .not("entreprise_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (entrepriseIds && entrepriseIds.length > 0) query = query.in("entreprise_id", entrepriseIds);

    const { data, error } = await query;
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as IdRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows };
}

/** entreprise_id → ids de ses dossiers, pour les entreprises qui en ont > 1. */
function duplicateGroups(rows: IdRow[]): Map<number, string[]> {
  const byEnterprise = new Map<number, string[]>();
  for (const row of rows) {
    const entrepriseId = Number(row.entreprise_id);
    if (!Number.isFinite(entrepriseId)) continue;
    const list = byEnterprise.get(entrepriseId);
    if (list) list.push(row.id);
    else byEnterprise.set(entrepriseId, [row.id]);
  }
  for (const [entrepriseId, ids] of byEnterprise) {
    if (ids.length < 2) byEnterprise.delete(entrepriseId);
  }
  return byEnterprise;
}

/**
 * GET → état des doublons. Réponse volontairement courte : un compteur et la
 * liste des entreprises concernées, à recouper avec l'erreur de l'index unique
 * (`Key (entreprise_id)=(…) is duplicated`).
 */
export const GET = withAuth({ role: "admin" }, async () => {
  const supabase = getServiceClient();
  const { rows, error } = await scanAllProjects(supabase);
  if (error) return jsonError(error, 500);

  const groups = duplicateGroups(rows);
  return json({
    ok: true,
    projectsScanned: rows.length,
    duplicateGroups: groups.size,
    duplicateRows: [...groups.values()].reduce((n, ids) => n + ids.length - 1, 0),
    entreprises: [...groups.entries()].map(([entrepriseId, ids]) => ({ entrepriseId, projectIds: ids })),
  });
});

interface GroupReport {
  entrepriseId: number;
  survivorId: string;
  duplicateIds: string[];
  /** Colonnes récupérées sur un doublon → id de la ligne d'origine. */
  recovered: Record<string, string>;
  /** Drapeaux remontés (validation humaine portée par un doublon). */
  flags: string[];
  moved: Record<string, number>;
  deleted: string[];
  error?: string;
}

/** Tables enfants à faire suivre le survivant. `optional` : la table peut ne pas
 *  exister selon l'âge de la base — on l'ignore alors au lieu de tout arrêter. */
const CHILD_TABLES: Array<{ table: string; column: string; optional?: boolean }> = [
  { table: "sites", column: "lead_magnet_project_id" },
  { table: "lead_magnet_reviews", column: "lead_magnet_project_id" },
  { table: "lead_magnet_pages", column: "lead_magnet_project_id", optional: true },
  { table: "email_logs", column: "lead_magnet_project_id", optional: true },
  { table: "production_lead_magnets", column: "lead_magnet_project_id", optional: true },
];

/** Une table absente (42P01) ou une colonne absente (42703) n'est pas une erreur. */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|could not find/i.test(error.message ?? "")
  );
}

export const POST = withAuth({ role: "admin" }, async ({ req }) => {
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; entrepriseIds?: number[] };
  // Simulation par défaut : il faut demander explicitement l'écriture.
  const dryRun = body.dryRun !== false;
  const targeted = Array.isArray(body.entrepriseIds)
    ? body.entrepriseIds.map(Number).filter(Number.isFinite)
    : undefined;

  const supabase = getServiceClient();

  const scan = await scanAllProjects(supabase, targeted);
  if (scan.error) return jsonError(scan.error, 500);
  const groups = duplicateGroups(scan.rows);

  const reports: GroupReport[] = [];

  for (const [entrepriseId, ids] of groups) {
    // Les lignes complètes ne sont chargées que pour les groupes concernés :
    // quelques dizaines de lignes au lieu de toute la table.
    const { data, error } = await supabase.from("lead_magnet_projects").select("*").in("id", ids);
    if (error) {
      reports.push({
        entrepriseId,
        survivorId: "",
        duplicateIds: ids,
        recovered: {},
        flags: [],
        moved: {},
        deleted: [],
        error: `lecture: ${error.message}`,
      });
      continue;
    }

    const rows = (data ?? []) as ProjectRecord[];
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
    const dupIds = duplicates.map((d) => String(d.id));
    const report: GroupReport = {
      entrepriseId,
      survivorId,
      duplicateIds: dupIds,
      recovered: plan.takenFrom,
      flags: Object.keys(flagsPatch),
      moved: {},
      deleted: [],
    };

    try {
      for (const child of CHILD_TABLES) {
        report.moved[child.table] = await countRows(supabase, child.table, child.column, dupIds);
      }

      if (!dryRun) {
        const patch = { ...plan.patch, ...flagsPatch };
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase
            .from("lead_magnet_projects")
            .update(patch)
            .eq("id", survivorId);
          if (upErr) throw new Error(`fusion: ${upErr.message}`);
        }

        for (const child of CHILD_TABLES) {
          if ((report.moved[child.table] ?? 0) === 0) continue;
          // `lead_magnet_content` est UNIQUE par projet : traité à part.
          const { error: mvErr } = await supabase
            .from(child.table)
            .update({ [child.column]: survivorId })
            .in(child.column, dupIds);
          if (mvErr && !(child.optional && isMissingRelation(mvErr))) {
            throw new Error(`${child.table}: ${mvErr.message}`);
          }
        }

        await moveUniqueContent(supabase, survivorId, dupIds, report);

        const { error: dErr } = await supabase.from("lead_magnet_projects").delete().in("id", dupIds);
        if (dErr) throw new Error(`suppression: ${dErr.message}`);
        report.deleted = dupIds;
      }
    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err);
    }

    reports.push(report);
  }

  // Vérification finale : ce qui reste après coup, pour ne pas envoyer
  // l'opérateur lancer une migration qui échouera.
  let remaining = groups.size;
  if (!dryRun) {
    const after = await scanAllProjects(supabase, targeted);
    remaining = after.error ? -1 : duplicateGroups(after.rows).size;
  }

  return json({
    ok: true,
    dryRun,
    projectsScanned: scan.rows.length,
    duplicateGroups: groups.size,
    duplicateRows: [...groups.values()].reduce((n, ids) => n + ids.length - 1, 0),
    recoveredFields: reports.reduce((n, r) => n + Object.keys(r.recovered).length, 0),
    errors: reports.filter((r) => r.error).length,
    remainingDuplicateGroups: remaining,
    reports,
  });
});

/** `lead_magnet_content` porte une contrainte UNIQUE par projet : on ne déplace
 *  une ligne que si le survivant n'en a pas déjà une. */
async function moveUniqueContent(
  supabase: ServiceClient,
  survivorId: string,
  dupIds: string[],
  report: GroupReport,
): Promise<void> {
  const onDuplicates = await countRows(supabase, "lead_magnet_content", "lead_magnet_project_id", dupIds);
  report.moved["lead_magnet_content"] = onDuplicates;
  if (onDuplicates === 0) return;

  const survivorHas = await countRows(supabase, "lead_magnet_content", "lead_magnet_project_id", [survivorId]);
  if (survivorHas > 0) {
    report.moved["lead_magnet_content"] = 0; // le survivant avait déjà son contenu
    return;
  }
  const { data: first } = await supabase
    .from("lead_magnet_content")
    .select("id")
    .in("lead_magnet_project_id", dupIds)
    .limit(1)
    .maybeSingle();
  const firstId = (first as { id?: string } | null)?.id;
  if (!firstId) return;
  const { error } = await supabase
    .from("lead_magnet_content")
    .update({ lead_magnet_project_id: survivorId })
    .eq("id", firstId);
  if (error && !isMissingRelation(error)) throw new Error(`lead_magnet_content: ${error.message}`);
  report.moved["lead_magnet_content"] = 1;
}

async function countRows(
  supabase: ServiceClient,
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
