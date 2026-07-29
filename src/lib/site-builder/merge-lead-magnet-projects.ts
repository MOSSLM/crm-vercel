/**
 * Fusion de deux (ou plus) `lead_magnet_projects` d'une même entreprise.
 *
 * D'où viennent les doublons : le trigger `ensure_lead_magnet_project_for_opportunity`
 * crée UN projet par opportunité, et `assignProspectToAgent` ouvre un second
 * deal dans le pipeline « Agent SAMA » quand l'entreprise n'en avait que dans un
 * autre pipeline. Attribuer 21 entreprises a donc créé 21 opportunités — et 21
 * projets vides — d'un coup.
 *
 * Conséquence : l'information se répartit entre les deux lignes selon la carte
 * utilisée. L'une porte les chiffres clés, l'autre le logo ou la ville SEO, et
 * le site n'en lit qu'une — d'où des chiffres bien saisis mais absents du site.
 *
 * La fusion est donc COMPLÉMENTAIRE, jamais destructive : une valeur absente du
 * survivant est reprise sur un doublon, une valeur déjà présente n'est jamais
 * écrasée. Personne ne perd ce qu'il a saisi.
 *
 * Pur et sans base : la route l'appelle, les tests aussi.
 */

/** Colonnes fusionnables, dans l'ordre où elles comptent. `opportunite_id`,
 *  `entreprise_id`, les id et les timestamps sont volontairement absents : ils
 *  identifient la ligne, ils ne se fusionnent pas. */
export const MERGEABLE_COLUMNS = [
  // Enrichissement / identité
  "logo_url",
  "favicon_url",
  "hero_image_url",
  "override_entreprise_name",
  "override_city",
  "override_city_source",
  "override_location",
  "override_phone",
  "override_email",
  "override_address",
  "opening_hours",
  "meta_title_default",
  "meta_description_default",
  // Chiffres clés
  "stat_years_experience",
  "stat_satisfied_clients",
  "stat_installations_completed",
  "stat_rge_count",
  // Contenu
  "hero_title",
  "hero_subtitle",
  "hero_description",
  "cta_primary_text",
  "cta_primary_target",
  "cta_secondary_text",
  "home_slogan_template",
  "home_about_services_template",
  "home_why_choose_title_template",
  "service_page_headline_template",
  "service_page_subheadline_template",
  "service_page_trust_title_template",
] as const;

/** Une ligne `lead_magnet_projects` telle qu'elle sort de la base : l'id est
 *  garanti, le reste dépend des colonnes réellement présentes. */
export type ProjectRecord = { id: string } & Record<string, unknown>;

/** Une valeur « absente » : null/undefined, chaîne vide, ou les marqueurs de
 *  stat vide utilisés partout ailleurs (`0`, `-`, `—`). */
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

export interface MergePlan {
  /** Colonnes à écrire sur le survivant (vide = rien à récupérer). */
  patch: Record<string, unknown>;
  /** Pour le rapport : colonne → id du doublon qui a fourni la valeur. */
  takenFrom: Record<string, string>;
}

/**
 * Calcule ce que le survivant doit récupérer des doublons.
 *
 * Le survivant garde tout ce qu'il a. Pour chaque colonne qu'il n'a pas, on
 * prend la première valeur non vide trouvée en parcourant les doublons dans
 * l'ordre fourni (le classement de `pickBestProject`, donc du plus avancé au
 * moins avancé).
 *
 * `service_tags_snapshot` (tableau) et `variables` (jsonb) reçoivent un
 * traitement dédié : on complète plutôt que de remplacer en bloc.
 */
export function buildMergePlan(survivor: ProjectRecord, duplicates: ProjectRecord[]): MergePlan {
  const patch: Record<string, unknown> = {};
  const takenFrom: Record<string, string> = {};

  for (const column of MERGEABLE_COLUMNS) {
    if (!isBlank(survivor[column])) continue;
    for (const dup of duplicates) {
      if (isBlank(dup[column])) continue;
      patch[column] = dup[column];
      takenFrom[column] = String(dup.id ?? "");
      break;
    }
  }

  // Tags de service : union, en gardant l'ordre du survivant puis des doublons.
  const tags = mergeTags(survivor, duplicates);
  if (tags) {
    patch.service_tags_snapshot = tags.value;
    if (tags.from) takenFrom.service_tags_snapshot = tags.from;
  }

  // `variables` : fusion par clé, le survivant gagne clé par clé.
  const vars = mergeVariables(survivor, duplicates);
  if (vars) {
    patch.variables = vars.value;
    if (vars.from) takenFrom.variables = vars.from;
  }

  return { patch, takenFrom };
}

function asTagArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

function mergeTags(
  survivor: ProjectRecord,
  duplicates: ProjectRecord[],
): { value: string[]; from: string | null } | null {
  const base = asTagArray(survivor.service_tags_snapshot);
  const seen = new Set(base);
  const out = [...base];
  let from: string | null = null;
  for (const dup of duplicates) {
    for (const tag of asTagArray(dup.service_tags_snapshot)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
      from = from ?? String(dup.id ?? "");
    }
  }
  return out.length > base.length ? { value: out, from } : null;
}

function asVarObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mergeVariables(
  survivor: ProjectRecord,
  duplicates: ProjectRecord[],
): { value: Record<string, unknown>; from: string | null } | null {
  const base = asVarObject(survivor.variables) ?? {};
  const out = { ...base };
  let from: string | null = null;
  for (const dup of duplicates) {
    const dupVars = asVarObject(dup.variables);
    if (!dupVars) continue;
    for (const [key, value] of Object.entries(dupVars)) {
      if (!isBlank(out[key]) || isBlank(value)) continue;
      out[key] = value;
      from = from ?? String(dup.id ?? "");
    }
  }
  return Object.keys(out).length > Object.keys(base).length ? { value: out, from } : null;
}

/**
 * Le survivant doit-il hériter des drapeaux d'avancement d'un doublon ?
 *
 * Un doublon peut porter une validation humaine que le survivant n'a pas (c'est
 * arrivé quand l'opérateur a validé depuis la carte de l'autre opportunité).
 * On ne rétrograde jamais : on ne fait que monter.
 */
export function buildFlagsPatch(survivor: ProjectRecord, duplicates: ProjectRecord[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (survivor.enrichment_validated !== true && duplicates.some((d) => d.enrichment_validated === true)) {
    patch.enrichment_validated = true;
  }
  if (survivor.pret_pour_lm !== true && duplicates.some((d) => d.pret_pour_lm === true)) {
    patch.pret_pour_lm = true;
  }
  return patch;
}
