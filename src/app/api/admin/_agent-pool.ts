import { getServiceClient } from "@/app/api/_lib/service-client";

type ServiceClient = ReturnType<typeof getServiceClient>;

/** Taille de page Supabase, et plafond de sécurité sur le pool entier. */
const PAGE = 1000;
const MAX_ROWS = 5000;
/** Ids par `in(...)` : au-delà, l'URL de la requête PostgREST devient énorme. */
const IN_CHUNK = 300;

export type EntRow = { id: number; name: string | null; ville: string | null; telephone: string | null };
export type OppRow = {
  entreprise_id: number | null;
  pipeline_id: string | null;
  stage_id: number | null;
  updated_at: string | null;
  owner_id?: string | null;
};
export type PipelineRow = { id: string; nom: string | null; ordre: number | null };
export type StageRow = { id: number; nom: string | null; pipeline_id: string; ordre: number | null };

/** Une affaire du prospect, réduite à ce que l'écran affiche et filtre. */
export type PoolDeal = {
  pipeline_id: string;
  pipeline_nom: string;
  stage_id: number | null;
  stage_nom: string | null;
  /** À qui l'affaire est attribuée — `null` = personne, elle est dans le pool. */
  owner_id: string | null;
};

export const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Le pool tenait dans un `.limit(200)` côté client : au-delà, les entreprises
 * suivantes étaient simplement invisibles depuis cet écran. On pagine jusqu'à
 * `MAX_ROWS` et on signale la troncature au lieu de la taire.
 */
export async function fetchPool(
  sc: ServiceClient,
): Promise<{ rows: EntRow[]; truncated: boolean; error?: string }> {
  const rows: EntRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sc
      .from("entreprises")
      .select("id, name, ville, telephone")
      .is("owner_id", null)
      .eq("qualifie", true)
      .order("name", { nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows, truncated: false, error: error.message };
    const page = (data ?? []) as EntRow[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** Les affaires d'un ensemble d'entreprises, par paquets d'ids puis par pages. */
export async function fetchDeals(sc: ServiceClient, entIds: number[]): Promise<OppRow[]> {
  const rows: OppRow[] = [];
  for (const ids of chunk(entIds, IN_CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sc
        .from("opportunites")
        .select("entreprise_id, pipeline_id, stage_id, updated_at, owner_id")
        .in("entreprise_id", ids)
        // Le pool admin raisonne sur les affaires vivantes : une archivée ne
        // doit pas faire croire qu'une entreprise est encore travaillée.
        .is("archived_at", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return rows;
      const page = (data ?? []) as OppRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

/** Combien d'entreprises chaque agent détient déjà — affiché dans le sélecteur. */
export async function fetchOwnedCounts(sc: ServiceClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sc
      .from("entreprises")
      .select("owner_id")
      .not("owner_id", "is", null)
      .is("archived_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return counts;
    const page = (data ?? []) as { owner_id: string | null }[];
    for (const row of page) {
      if (row.owner_id) counts[row.owner_id] = (counts[row.owner_id] ?? 0) + 1;
    }
    if (page.length < PAGE) return counts;
  }
  return counts;
}

/**
 * Les affaires d'une entreprise, une par pipeline — la plus récemment mise à
 * jour l'emporte.
 *
 * `skipPipelineId` a disparu : il servait à masquer le pipeline « Agent SAMA »,
 * commun à toutes les entreprises attribuées parce que l'attribution y créait
 * systématiquement une affaire. Depuis qu'elle réutilise l'affaire existante,
 * une affaire dans « Agent SAMA » est une vraie affaire — la seule, pour les
 * entreprises qui n'en avaient aucune. La masquer priverait l'admin de la seule
 * ligne de ces prospects.
 *
 * Le retour reste un TABLEAU le temps que l'invariant « une entreprise = une
 * affaire » soit posé en base : tant qu'un doublon subsiste, mieux vaut que
 * l'admin le voie que de n'en montrer qu'un arbitrairement.
 */
export function dealsByEntreprise(
  opps: OppRow[],
  pipelines: Map<string, PipelineRow>,
  stages: Map<number, StageRow>,
): Map<number, PoolDeal[]> {
  const best = new Map<number, Map<string, { deal: PoolDeal; updatedAt: string }>>();

  for (const o of opps) {
    const entId = o.entreprise_id;
    if (entId == null || !o.pipeline_id) continue;
    const pipeline = pipelines.get(o.pipeline_id);
    if (!pipeline) continue;

    const stage = o.stage_id != null ? stages.get(o.stage_id) : undefined;
    const deal: PoolDeal = {
      pipeline_id: o.pipeline_id,
      pipeline_nom: pipeline.nom ?? "Sans nom",
      stage_id: o.stage_id,
      stage_nom: stage?.nom ?? null,
      owner_id: o.owner_id ?? null,
    };
    const updatedAt = o.updated_at ?? "";

    const perPipeline = best.get(entId) ?? new Map<string, { deal: PoolDeal; updatedAt: string }>();
    const cur = perPipeline.get(o.pipeline_id);
    if (!cur || updatedAt > cur.updatedAt) perPipeline.set(o.pipeline_id, { deal, updatedAt });
    best.set(entId, perPipeline);
  }

  const ordre = (id: string) => pipelines.get(id)?.ordre ?? Number.MAX_SAFE_INTEGER;
  const out = new Map<number, PoolDeal[]>();
  for (const [entId, perPipeline] of best) {
    out.set(
      entId,
      [...perPipeline.values()]
        .map((v) => v.deal)
        .sort((a, b) => ordre(a.pipeline_id) - ordre(b.pipeline_id)),
    );
  }
  return out;
}
