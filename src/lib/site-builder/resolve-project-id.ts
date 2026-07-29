/**
 * Quel `lead_magnet_projects` appartient à ce site ? Un seul résolveur.
 *
 * `lead_magnet_projects` porte **une ligne par opportunité**, pas par entreprise
 * (trigger `ensure_lead_magnet_project_for_opportunity`, `on conflict
 * (opportunite_id)`). Une entreprise à N opportunités a donc N projets, et rien
 * n'est unique sur `entreprise_id` — malgré plusieurs commentaires du code qui
 * affirmaient le contraire.
 *
 * Les deux bouts de la chaîne ne choisissaient pas la même ligne :
 *   - la fiche du pipeline web écrit les chiffres clés sur le projet de
 *     L'OPPORTUNITÉ, en préférant celui qui est validé (`_board.ts`) ;
 *   - le builder les relisait avec un `.eq("entreprise_id", X).limit(1)` SANS
 *     `order`, donc sur une ligne arbitraire — souvent un `draft` jamais enrichi
 *     dont les quatre `stat_*` sont NULL.
 * D'où des chiffres bien saisis sur la fiche et une section vide sur le site.
 *
 * Ce module tranche une fois pour toutes, dans cet ordre :
 *   1. un id explicitement fourni (paramètre `?project`) ;
 *   2. `sites.lead_magnet_project_id` — le champ qui ENREGISTRE l'appartenance,
 *      et la seule réponse non ambiguë ;
 *   3. à défaut, un classement déterministe des projets de l'entreprise, calqué
 *      sur la règle du board pour rester cohérent avec ce que l'opérateur voit.
 *
 * `source` et `candidates` sont remontés jusqu'au panneau Diagnostic du builder :
 * un chiffre vide doit pouvoir s'expliquer sans ouvrir la base.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TERMINAL_STATUSES, isMissingColumn } from "@/app/api/marketing-pipeline/_enrich-reset";
import type { ProjectSource } from "./variables-source";

export type { ProjectSource };

export interface ProjectResolution {
  projectId: string | null;
  source: ProjectSource;
  /** Nombre de projets rattachés à l'entreprise. > 1 ⇒ seul le lien du site
   *  lève l'ambiguïté ; le classement n'est qu'un pis-aller. */
  candidates: number;
}

const TERMINAL_SET = new Set<string>(TERMINAL_STATUSES);

interface ProjectRow {
  id: string;
  enrichment_validated?: boolean | null;
  pret_pour_lm?: boolean | null;
  statut?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

/** Colonnes du classement. `enrichment_validated` peut manquer sur une base non
 *  migrée : on retente sans elle, comme le fait le board. */
const RANK_COLUMNS = "id, enrichment_validated, pret_pour_lm, statut, updated_at, created_at";
const RANK_COLUMNS_LEGACY = "id, pret_pour_lm, statut, updated_at, created_at";

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return isNaN(t) ? 0 : t;
}

/**
 * Ordre de préférence entre deux projets d'une même entreprise. Reproduit la
 * règle du board (`_board.ts` : « keep the validated one if any ») puis
 * départage par fraîcheur, et enfin par id pour que le résultat soit stable
 * d'un appel à l'autre — un tirage au sort était précisément le bug.
 */
export function compareProjects(a: ProjectRow, b: ProjectRow): number {
  const score = (p: ProjectRow): number =>
    (p.enrichment_validated === true ? 8 : 0) +
    (p.pret_pour_lm === true ? 4 : 0) +
    (TERMINAL_SET.has(p.statut ?? "") ? 2 : 0);
  const byScore = score(b) - score(a);
  if (byScore !== 0) return byScore;
  const byUpdated = time(b.updated_at) - time(a.updated_at);
  if (byUpdated !== 0) return byUpdated;
  const byCreated = time(b.created_at) - time(a.created_at);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

/** Meilleur projet d'une liste, ou null. Pur — testable sans base. */
export function pickBestProject(rows: ProjectRow[]): ProjectRow | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return [...rows].sort(compareProjects)[0];
}

export interface ResolveProjectOptions {
  /** Id fourni par l'appelant (paramètre `?project`). Prioritaire sur tout. */
  explicitProjectId?: string | null;
  /** Site dont on veut le projet : `sites.lead_magnet_project_id` fait foi. */
  siteId?: string | null;
  /** Repli : l'entreprise, quand aucun lien n'est enregistré. */
  enterpriseId?: number | null;
}

/**
 * Résout le projet lead magnet d'un site / d'une entreprise. Ne throw jamais :
 * en cas d'échec de requête, renvoie `{ projectId: null, source: "none" }`.
 */
export async function resolveLeadMagnetProjectId(
  supabase: SupabaseClient,
  opts: ResolveProjectOptions,
): Promise<ProjectResolution> {
  const { explicitProjectId, siteId, enterpriseId } = opts;

  if (explicitProjectId) {
    return { projectId: explicitProjectId, source: "explicit", candidates: 0 };
  }

  if (siteId) {
    const { data } = await supabase
      .from("sites")
      .select("lead_magnet_project_id")
      .eq("id", siteId)
      .maybeSingle();
    const linked = (data as { lead_magnet_project_id?: string | null } | null)?.lead_magnet_project_id;
    if (linked) {
      // On compte quand même les candidats : le panneau Diagnostic doit pouvoir
      // dire « 3 projets, celui du site est X » plutôt que juste « X ».
      return { projectId: linked, source: "site", candidates: await countProjects(supabase, enterpriseId) };
    }
  }

  if (enterpriseId == null) return { projectId: null, source: "none", candidates: 0 };

  const rows = await fetchProjects(supabase, enterpriseId);
  const best = pickBestProject(rows);
  return best
    ? { projectId: best.id, source: "ranked", candidates: rows.length }
    : { projectId: null, source: "none", candidates: 0 };
}

/**
 * Version en lot : meilleur projet par entreprise, en une requête. Utilisée par
 * les déploiements de masse, qui construisaient jusqu'ici une map
 * premier-arrivé (ou dernier-arrivé) — donc un projet différent à chaque
 * exécution pour une entreprise à plusieurs opportunités.
 *
 * `onlyReady` conserve le filtre `pret_pour_lm` du déploiement par lot : une
 * entreprise dont aucun projet n'est prêt sort sans lien, comme avant.
 */
export async function bestProjectIdByEnterprise(
  supabase: SupabaseClient,
  enterpriseIds: number[],
  opts: { onlyReady?: boolean } = {},
): Promise<Map<number, string>> {
  const ids = [...new Set(enterpriseIds.filter((id) => Number.isFinite(id)))];
  const out = new Map<number, string>();
  if (ids.length === 0) return out;

  const select = (columns: string) => {
    const q = supabase.from("lead_magnet_projects").select(`${columns}, entreprise_id`).in("entreprise_id", ids);
    return opts.onlyReady ? q.eq("pret_pour_lm", true) : q;
  };

  let res = await select(RANK_COLUMNS);
  if (res.error && isMissingColumn(res.error)) res = await select(RANK_COLUMNS_LEGACY);
  if (res.error) return out;

  const byEnterprise = new Map<number, ProjectRow[]>();
  for (const row of (res.data ?? []) as unknown as Array<ProjectRow & { entreprise_id: number | null }>) {
    if (row.entreprise_id == null) continue;
    const list = byEnterprise.get(row.entreprise_id);
    if (list) list.push(row);
    else byEnterprise.set(row.entreprise_id, [row]);
  }
  for (const [entrepriseId, rows] of byEnterprise) {
    const best = pickBestProject(rows);
    if (best) out.set(entrepriseId, best.id);
  }
  return out;
}

async function fetchProjects(supabase: SupabaseClient, enterpriseId: number): Promise<ProjectRow[]> {
  const first = await supabase
    .from("lead_magnet_projects")
    .select(RANK_COLUMNS)
    .eq("entreprise_id", enterpriseId);
  if (!first.error) return (first.data ?? []) as unknown as ProjectRow[];
  if (!isMissingColumn(first.error)) return [];

  const legacy = await supabase
    .from("lead_magnet_projects")
    .select(RANK_COLUMNS_LEGACY)
    .eq("entreprise_id", enterpriseId);
  return legacy.error ? [] : ((legacy.data ?? []) as unknown as ProjectRow[]);
}

async function countProjects(supabase: SupabaseClient, enterpriseId: number | null | undefined): Promise<number> {
  if (enterpriseId == null) return 0;
  const { count, error } = await supabase
    .from("lead_magnet_projects")
    .select("id", { count: "exact", head: true })
    .eq("entreprise_id", enterpriseId);
  return error ? 0 : (count ?? 0);
}
