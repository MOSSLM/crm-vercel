/**
 * Une entreprise = UNE affaire.
 *
 * D'OÙ VIENNENT LES DOUBLONS
 * `assignProspectToAgent` ne cherchait une affaire réutilisable que dans le
 * pipeline « Agent SAMA », et seulement si elle appartenait déjà à l'agent ou à
 * personne. Une entreprise dont l'affaire vivait dans « Streak Mars/Avril »
 * n'avait donc aucun candidat : l'attribution ouvrait une SECONDE affaire.
 * Attribuer 47 entreprises a créé 47 affaires en double d'un coup — et, un cran
 * plus bas, 47 dossiers lead magnet vides (cf.
 * `sql/20260731_one_lead_magnet_project_per_company.sql`, qui a corrigé le
 * symptôme sans corriger la cause).
 *
 * LA RÈGLE
 * Attribuer un prospect à un agent, c'est poser `owner_id` sur l'affaire qui
 * existe déjà, quel que soit son pipeline. On ne crée une affaire que si
 * l'entreprise n'en a strictement aucune. Une affaire ne change jamais de
 * pipeline du fait d'une attribution.
 *
 * Pur et sans base : les routes l'appellent, les tests aussi.
 */

/** Une ligne `opportunites` telle qu'elle sort de la base. */
export type DealRecord = {
  id: string;
  entreprise_id?: number | null;
  owner_id?: string | null;
  pipeline_id?: string | null;
  stage_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_test?: boolean | null;
} & Record<string, unknown>;

/**
 * Les affaires de test portent chacune leur propre entreprise fictive
 * (`/api/test-opportunities`). Elles ne doivent jamais être fusionnées avec du
 * réel, ni compter dans « cette entreprise a-t-elle déjà une affaire ».
 */
export const isRealDeal = (deal: DealRecord): boolean => deal.is_test !== true;

/** Ordre de tri stable : la plus ancienne d'abord, l'id départage. */
export function compareDeals(a: DealRecord, b: DealRecord): number {
  const at = a.created_at ?? "";
  const bt = b.created_at ?? "";
  if (at !== bt) return at < bt ? -1 : 1;
  return String(a.id) < String(b.id) ? -1 : 1;
}

/**
 * L'affaire à conserver parmi celles d'une même entreprise.
 *
 * C'est la PLUS ANCIENNE : elle porte l'historique — le montant négocié, les
 * notes, les tags, les audits, les inscriptions en séquence. La récente est la
 * coquille ouverte par l'attribution. Garder la récente reviendrait à jeter des
 * mois de travail pour préserver une ligne créée par erreur.
 */
export function pickSurvivor(deals: DealRecord[]): DealRecord | null {
  const real = deals.filter(isRealDeal);
  if (real.length === 0) return null;
  return [...real].sort(compareDeals)[0];
}

/**
 * Colonnes fusionnables, complétées seulement si le survivant ne les a pas.
 *
 * Absentes volontairement : `id`, `entreprise_id`, `created_at`, `updated_at`,
 * `is_test` (elles identifient la ligne) et surtout `pipeline_id` / `stage_id` /
 * `owner_id`, qui décrivent la POSITION de l'affaire. Reprendre le `stage_id`
 * d'un doublon déclencherait `trg_sync_opportunity_pipeline_from_stage` et
 * déplacerait le survivant de pipeline — exactement ce qu'on cherche à empêcher.
 */
export const MERGEABLE_COLUMNS = [
  "contact_id",
  "name",
  "montant",
  "priorite",
  "type",
  "mrr",
  "recurrence_months",
  "note_base",
  "date_prochain_suivi",
  "offre_id",
  "offre_nom_snapshot",
  "offre_prix_ht_snapshot",
  "offre_devise_snapshot",
] as const;

/**
 * Une valeur « absente ». Même convention que la fusion des dossiers lead
 * magnet (`src/lib/site-builder/merge-lead-magnet-projects.ts`), à une nuance
 * près : `0` numérique est ici une valeur PLEINE (un montant à 0 € est une
 * information), alors que la chaîne "0" reste un marqueur de champ vide.
 */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t === "0" || t === "-" || t === "—";
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

export interface DealMergePlan {
  /** Colonnes à écrire sur le survivant (vide = rien à récupérer). */
  patch: Record<string, unknown>;
  /** Pour le rapport : colonne → id du doublon qui a fourni la valeur. */
  takenFrom: Record<string, string>;
}

/**
 * Ce que le survivant récupère des doublons : COMPLÉMENTAIRE, jamais destructif.
 * Une valeur déjà présente sur le survivant n'est jamais écrasée ; une valeur
 * qu'il n'a pas est reprise sur le premier doublon qui la porte.
 *
 * `tags` et `flags` sont des tableaux : on en fait l'union plutôt que de
 * remplacer en bloc. `lead_magnet` ne se rétrograde jamais.
 */
export function buildDealMergePlan(survivor: DealRecord, duplicates: DealRecord[]): DealMergePlan {
  const patch: Record<string, unknown> = {};
  const takenFrom: Record<string, string> = {};

  for (const column of MERGEABLE_COLUMNS) {
    if (!isBlank(survivor[column])) continue;
    for (const dup of duplicates) {
      if (isBlank(dup[column])) continue;
      patch[column] = dup[column];
      takenFrom[column] = String(dup.id);
      break;
    }
  }

  for (const column of ["tags", "flags"] as const) {
    const merged = mergeArray(survivor[column], duplicates, column);
    if (merged) {
      patch[column] = merged.value;
      if (merged.from) takenFrom[column] = merged.from;
    }
  }

  // Drapeau d'avancement : on ne monte que d'un cran, jamais l'inverse.
  if (survivor.lead_magnet !== true && duplicates.some((d) => d.lead_magnet === true)) {
    patch.lead_magnet = true;
    const from = duplicates.find((d) => d.lead_magnet === true);
    if (from) takenFrom.lead_magnet = String(from.id);
  }

  return { patch, takenFrom };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  }
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

function mergeArray(
  base: unknown,
  duplicates: DealRecord[],
  column: string,
): { value: string[]; from: string | null } | null {
  const start = asStringArray(base);
  const seen = new Set(start);
  const out = [...start];
  let from: string | null = null;
  for (const dup of duplicates) {
    for (const item of asStringArray(dup[column])) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
      from = from ?? String(dup.id);
    }
  }
  return out.length > start.length ? { value: out, from } : null;
}

/** entreprise_id → ses affaires réelles, pour les entreprises qui en ont > 1. */
export function duplicateGroups(deals: DealRecord[]): Map<number, DealRecord[]> {
  const byEnterprise = new Map<number, DealRecord[]>();
  for (const deal of deals) {
    if (!isRealDeal(deal)) continue;
    // `Number(null)` vaut 0, et 0 est fini : sans ce test explicite, toutes les
    // affaires sans entreprise se regrouperaient sous une entreprise « 0 ».
    if (deal.entreprise_id == null) continue;
    const entrepriseId = Number(deal.entreprise_id);
    if (!Number.isFinite(entrepriseId)) continue;
    const list = byEnterprise.get(entrepriseId);
    if (list) list.push(deal);
    else byEnterprise.set(entrepriseId, [deal]);
  }
  for (const [entrepriseId, list] of byEnterprise) {
    if (list.length < 2) byEnterprise.delete(entrepriseId);
  }
  return byEnterprise;
}
