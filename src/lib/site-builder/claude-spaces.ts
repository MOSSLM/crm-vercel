/**
 * Sépare les deux espaces d'un design Claude : les TEMPLATES (les modèles
 * réutilisables importés depuis un .zip) et les SITES DÉMO clonés depuis ces
 * modèles.
 *
 * Les deux vivent dans la même table `sites` et ne se distinguent que par
 * `is_template`. Affichés dans une seule grille, un template et les dix démos
 * qui en sortent se ressemblent — on ne sait plus lequel on édite, ni lequel on
 * supprime. Ce module fait la répartition une bonne fois, et rattache chaque
 * démo au template dont elle vient (`source_template_id`) pour que l'interface
 * puisse l'afficher.
 *
 * Pure et sans dépendance : la même logique sert la page /site-builder et ses
 * tests.
 */

export interface ClaudeSiteLike {
  id: string;
  name?: string | null;
  /** `true` = modèle réutilisable ; `false`/absent = site démo. */
  is_template?: boolean | null;
  /** Template dont ce site est le clone (migration 20260730). */
  source_template_id?: string | null;
}

/** D'où vient un site — ce qu'on peut honnêtement en dire. */
export type TemplateOrigin =
  /** Le template d'origine est connu et toujours là. */
  | { kind: "known"; id: string; name: string }
  /** Le lien existe mais la ligne n'est plus dans la liste (template supprimé). */
  | { kind: "missing"; id: string }
  /** Aucun lien : site créé avant la migration, ou hors clonage. */
  | { kind: "unknown" };

export interface ClaudeSpaces<T> {
  /** Les modèles réutilisables, dans l'ordre reçu. */
  templates: T[];
  /** Les sites démo issus (ou non) d'un template, dans l'ordre reçu. */
  demos: T[];
  /** Nombre de sites démo par template (clé = id du template). */
  demoCountByTemplate: Record<string, number>;
  /** Nombre de variantes (templates dupliqués) par template d'origine. */
  variantCountByTemplate: Record<string, number>;
  /** Nom de chaque site connu, par id — sert à étiqueter les démos. */
  nameById: Record<string, string>;
}

/** Nom affichable d'un site, jamais vide (les listes ne doivent pas trouer). */
export const siteLabel = (site: ClaudeSiteLike): string =>
  (site.name ?? "").trim() || "Sans nom";

/** `true` quand le site est un modèle réutilisable et non une démo. */
export const isTemplateSite = (site: ClaudeSiteLike): boolean => site.is_template === true;

/**
 * Répartit une liste de sites Claude Design entre l'espace template et l'espace
 * démo, et compte ce que chaque template a produit.
 */
export function splitClaudeSpaces<T extends ClaudeSiteLike>(sites: T[]): ClaudeSpaces<T> {
  const templates: T[] = [];
  const demos: T[] = [];
  const demoCountByTemplate: Record<string, number> = {};
  const variantCountByTemplate: Record<string, number> = {};
  const nameById: Record<string, string> = {};

  for (const site of sites) {
    nameById[site.id] = siteLabel(site);
    const source = site.source_template_id ?? null;

    if (isTemplateSite(site)) {
      templates.push(site);
      // Un template dupliqué garde la trace de son modèle : c'est une variante,
      // pas une démo — on la compte à part pour ne pas gonfler « N sites créés ».
      if (source) variantCountByTemplate[source] = (variantCountByTemplate[source] ?? 0) + 1;
      continue;
    }

    demos.push(site);
    if (source) demoCountByTemplate[source] = (demoCountByTemplate[source] ?? 0) + 1;
  }

  return { templates, demos, demoCountByTemplate, variantCountByTemplate, nameById };
}

/**
 * Ce qu'on sait de l'origine d'un site. On distingue « pas de lien » (créé avant
 * la migration) de « lien cassé » (template supprimé) : dans le premier cas il
 * n'y a rien à réparer, dans le second il y a un modèle à re-choisir.
 */
export function templateOrigin(
  site: ClaudeSiteLike,
  nameById: Record<string, string>,
): TemplateOrigin {
  const id = site.source_template_id ?? null;
  if (!id) return { kind: "unknown" };
  const name = nameById[id];
  return name ? { kind: "known", id, name } : { kind: "missing", id };
}

/** Libellé court prêt à afficher pour une origine. */
export function templateOriginLabel(origin: TemplateOrigin): string {
  if (origin.kind === "known") return origin.name;
  if (origin.kind === "missing") return "Template supprimé";
  return "Origine inconnue";
}

/** Clé de filtre « par template » utilisée par les listes de démos. */
export const ORIGIN_ALL = "__all__";
export const ORIGIN_NONE = "__none__";

/**
 * Filtre des démos sur leur template d'origine.
 * `ORIGIN_ALL` ne filtre rien, `ORIGIN_NONE` ne garde que les démos sans lien
 * exploitable (aucun `source_template_id`, ou template disparu).
 */
export function filterDemosByTemplate<T extends ClaudeSiteLike>(
  demos: T[],
  templateId: string,
  nameById: Record<string, string>,
): T[] {
  if (templateId === ORIGIN_ALL) return demos;
  if (templateId === ORIGIN_NONE) {
    return demos.filter((d) => templateOrigin(d, nameById).kind !== "known");
  }
  return demos.filter((d) => (d.source_template_id ?? null) === templateId);
}
