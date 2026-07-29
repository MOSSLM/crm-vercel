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
  /** Lignes enfants rattachées au survivant, par table. */
  moved: Record<string, number>;
  /** Lignes enfants supprimées car le survivant avait déjà son équivalent
   *  (avis auto, pages par défaut — régénérés par la base). */
  dropped: Record<string, number>;
  deleted: string[];
  error?: string;
}

/** Tables enfants à faire suivre le survivant. `optional` : la table peut ne pas
 *  exister selon l'âge de la base — on l'ignore alors au lieu de tout arrêter. */
const CHILD_TABLES: Array<{ table: string; column: string; optional?: boolean }> = [
  { table: "sites", column: "lead_magnet_project_id" },
  { table: "lead_magnet_reviews", column: "lead_magnet_project_id" },
  { table: "lead_magnet_content", column: "lead_magnet_project_id", optional: true },
  { table: "lead_magnet_pages", column: "lead_magnet_project_id", optional: true },
  { table: "email_logs", column: "lead_magnet_project_id", optional: true },
  { table: "production_lead_magnets", column: "lead_magnet_project_id", optional: true },
];

/** Une table absente (42P01) ou une colonne absente (42703) n'est pas une erreur. */
function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key value violates unique constraint/i.test(error.message ?? "");
}

/**
 * Fait suivre au survivant les lignes enfants d'un doublon, UNE PAR UNE.
 *
 * Le déplacement en bloc ne peut pas marcher : la base crée automatiquement des
 * avis (`lm_sync_reviews_for_project`) et des pages par défaut
 * (`lm_create_default_pages`) POUR CHAQUE projet, et ces tables portent un index
 * unique par projet. Le survivant a donc déjà l'équivalent de ce que porte le
 * doublon, et l'`UPDATE` global échouait sur `lead_magnet_reviews_auto_unique_idx`
 * / `lead_magnet_pages_unique_project_key` — ce qui bloquait toute la fusion.
 *
 * Règle : on déplace ce qui peut l'être, et une ligne qui entre en collision est
 * SUPPRIMÉE — le survivant possède déjà sa version, et ces lignes-là sont
 * dérivées (la base les régénère). Rien d'unique n'est perdu.
 */
async function moveChildRows(
  supabase: ServiceClient,
  table: string,
  column: string,
  dupIds: string[],
  survivorId: string,
  optional: boolean,
): Promise<{ moved: number; dropped: number }> {
  const { data, error } = await supabase.from(table).select("id").in(column, dupIds);
  if (error) {
    if (optional && isMissingRelation(error)) return { moved: 0, dropped: 0 };
    throw new Error(`${table}: ${error.message}`);
  }

  let moved = 0;
  let dropped = 0;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const { error: mvErr } = await supabase.from(table).update({ [column]: survivorId }).eq("id", row.id);
    if (!mvErr) {
      moved++;
      continue;
    }
    if (!isUniqueViolation(mvErr)) throw new Error(`${table}: ${mvErr.message}`);
    const { error: delErr } = await supabase.from(table).delete().eq("id", row.id);
    if (delErr) throw new Error(`${table} (suppression de la ligne en double): ${delErr.message}`);
    dropped++;
  }
  return { moved, dropped };
}

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
        dropped: {},
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
      dropped: {},
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
          const { moved, dropped } = await moveChildRows(
            supabase, child.table, child.column, dupIds, survivorId, child.optional === true,
          );
          report.moved[child.table] = moved;
          if (dropped > 0) report.dropped[child.table] = dropped;
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
